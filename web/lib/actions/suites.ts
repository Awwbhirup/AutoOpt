"use server";

/**
 * Creating a benchmark suite, and starting, resuming or cancelling a run of it.
 *
 * Starting a run plans every (program, method, seed) up front as QUEUED rows
 * and hands the queue to a worker scheduled with after(), so the action returns
 * as soon as the plan is written. The results page streams progress from the
 * table, and resumes the queue itself if the worker ran out of time.
 */

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { auth } from "../../auth";
import { authorize, type Action } from "../authorize";
import { prisma } from "../db";
import { findWorkspaceBySlug } from "../repositories/workspaces";
import { engineStatus, runnableMethods } from "../engine";
import { principalFor } from "../session";
import { MAX_SEEDS, MAX_SUITE_PROGRAMS, MAX_SUITE_RUNS, planRuns, plannedCount, readGrid } from "../suites/grid";
import { workOnSuiteRun } from "../suites/worker";
import {
  type ActionState,
  created,
  ENGINE_OFFLINE,
  failed,
  field,
  isUniqueViolation,
  NO_WORKSPACE,
  SIGNED_OUT,
} from "./form";

/** How long a worker started by an action keeps claiming runs. */
const WORKER_BUDGET_MS = 250_000;

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

interface Caller {
  userId: string;
  workspace: { id: string; slug: string };
}

async function callerFor(slug: string, action: Action, refusal: string): Promise<Caller | string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return SIGNED_OUT;

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) return NO_WORKSPACE;

  const principal = await principalFor(prisma, userId, workspace.id);
  if (!authorize(principal, action)) {
    return principal.role === null ? NO_WORKSPACE : refusal;
  }
  return { userId, workspace: { id: workspace.id, slug: workspace.slug } };
}

function all(form: FormData, name: string): string[] {
  return [...new Set(form.getAll(name).filter((value): value is string => typeof value === "string"))];
}

export interface SuiteFields {
  name: string;
  description: string | null;
  programIds: string[];
  methods: string[];
  seeds: number[];
  proveFinal: boolean;
}

/** The form, checked. Exported for the tests; the action is the caller. */
export async function readSuiteForm(form: FormData): Promise<{ ok: true; value: SuiteFields } | { ok: false; error: string }> {
  const name = field(form, "name");
  const description = field(form, "description");
  const programIds = all(form, "programIds");
  const methods = all(form, "methods");
  const seedCount = Number.parseInt(field(form, "seeds") || "1", 10);

  if (!name) return { ok: false, error: "A suite needs a name." };
  if (name.length > MAX_NAME) return { ok: false, error: `A suite name is at most ${MAX_NAME} characters.` };
  if (description.length > MAX_DESCRIPTION) {
    return { ok: false, error: `A description is at most ${MAX_DESCRIPTION} characters.` };
  }
  if (programIds.length === 0) return { ok: false, error: "Pick at least one program." };
  if (programIds.length > MAX_SUITE_PROGRAMS) {
    return { ok: false, error: `A suite holds at most ${MAX_SUITE_PROGRAMS} programs.` };
  }
  if (methods.length === 0) return { ok: false, error: "Pick at least one method." };
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > MAX_SEEDS) {
    return { ok: false, error: `Seeds per run is between 1 and ${MAX_SEEDS}.` };
  }
  const seeds = Array.from({ length: seedCount }, (_, index) => index);
  if (plannedCount(programIds.length, { methods, seeds, proveFinal: false }) > MAX_SUITE_RUNS) {
    return {
      ok: false,
      error: `That is more than ${MAX_SUITE_RUNS} runs. Pick fewer programs, methods or seeds.`,
    };
  }

  return {
    ok: true,
    value: {
      name,
      description: description || null,
      programIds,
      methods,
      seeds,
      proveFinal: form.get("proveFinal") === "on",
    },
  };
}

export async function createSuite(_previous: ActionState, form: FormData): Promise<ActionState> {
  const caller = await callerFor(
    field(form, "workspace"),
    "suite:create",
    "Your role in this workspace does not allow creating suites.",
  );
  if (typeof caller === "string") return failed(caller);

  const read = await readSuiteForm(form);
  if (!read.ok) return failed(read.error);
  const suite = read.value;

  // Every program has to be in this workspace. Ids from elsewhere are dropped
  // by the filter, and a count that comes up short refuses the whole form.
  const found = await prisma.program.findMany({
    where: { id: { in: suite.programIds }, project: { workspaceId: caller.workspace.id } },
    select: { id: true },
  });
  if (found.length !== suite.programIds.length) {
    return failed("One of those programs is not in this workspace.");
  }

  try {
    const row = await prisma.benchmarkSuite.create({
      data: {
        workspaceId: caller.workspace.id,
        createdById: caller.userId,
        name: suite.name,
        description: suite.description,
        grid: { methods: suite.methods, seeds: suite.seeds, proveFinal: suite.proveFinal },
        programs: {
          create: suite.programIds.map((programId, position) => ({ programId, position })),
        },
      },
      select: { id: true },
    });
    revalidatePath(`/w/${caller.workspace.slug}/suites`);
    return created(row.id);
  } catch (error) {
    if (isUniqueViolation(error)) return failed("A suite with that name already exists here.");
    throw error;
  }
}

export async function startSuiteRun(_previous: ActionState, form: FormData): Promise<ActionState> {
  const caller = await callerFor(
    field(form, "workspace"),
    "suite:run",
    "Your role in this workspace does not allow running suites.",
  );
  if (typeof caller === "string") return failed(caller);

  const suite = await prisma.benchmarkSuite.findUnique({
    where: { id: field(form, "suiteId") },
    select: {
      id: true,
      workspaceId: true,
      grid: true,
      programs: { select: { programId: true, program: { select: { category: true } } }, orderBy: { position: "asc" } },
    },
  });
  if (suite === null || suite.workspaceId !== caller.workspace.id) return failed("No such suite.");
  if (suite.programs.length === 0) return failed("This suite has no programs left in it.");

  const engine = await engineStatus();
  if (!engine.online) return failed(ENGINE_OFFLINE);

  const grid = readGrid(suite.grid);
  const runnable = new Set(
    runnableMethods(engine),
  );
  const missing = grid.methods.filter((method) => !runnable.has(method));
  if (missing.length > 0) {
    return failed(`This engine cannot run ${missing.join(", ")} right now.`);
  }

  const category = new Map(suite.programs.map((entry) => [entry.programId, entry.program.category]));
  const plan = planRuns(
    suite.programs.map((entry) => entry.programId),
    grid,
  );

  const suiteRun = await prisma.suiteRun.create({
    data: {
      suiteId: suite.id,
      startedById: caller.userId,
      grid: grid as unknown as Prisma.InputJsonValue,
      total: plan.length,
      runs: {
        createMany: {
          data: plan.map((planned, order) => ({
            programId: planned.programId,
            startedById: caller.userId,
            method: planned.method,
            seed: planned.seed,
            status: "QUEUED" as const,
            config: {
              order,
              proveFinal: grid.proveFinal,
              useSmt: false,
              maxIterations: null,
              nodeBudget: null,
              category: category.get(planned.programId) ?? "mixed",
            },
          })),
        },
      },
    },
    select: { id: true },
  });

  after(() => workOnSuiteRun(suiteRun.id, WORKER_BUDGET_MS));
  revalidatePath(`/w/${caller.workspace.slug}/suites/${suite.id}`);
  return created(suiteRun.id);
}

/** Stops a suite run: what is queued is dropped, what is running finishes. */
export async function cancelSuiteRun(_previous: ActionState, form: FormData): Promise<ActionState> {
  const caller = await callerFor(
    field(form, "workspace"),
    "suite:run",
    "Your role in this workspace does not allow stopping suites.",
  );
  if (typeof caller === "string") return failed(caller);

  const suiteRunId = field(form, "suiteRunId");
  const suiteRun = await prisma.suiteRun.findUnique({
    where: { id: suiteRunId },
    select: { id: true, suite: { select: { id: true, workspaceId: true } } },
  });
  if (suiteRun === null || suiteRun.suite.workspaceId !== caller.workspace.id) {
    return failed("No such suite run.");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.run.updateMany({
      where: { suiteRunId, status: "QUEUED" },
      data: { status: "ABANDONED", error: "the suite run was stopped", finishedAt: now },
    }),
    prisma.suiteRun.update({
      where: { id: suiteRunId },
      data: { status: "ABANDONED", finishedAt: now },
    }),
  ]);
  revalidatePath(`/w/${caller.workspace.slug}/suites/${suiteRun.suite.id}`);
  return created(suiteRunId);
}
