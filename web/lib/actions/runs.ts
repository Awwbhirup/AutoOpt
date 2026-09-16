/**
 * Starting a run, and keeping it.
 *
 * The route streams a decision log to the browser. This is what makes it
 * outlive the page that watched it: every event is written as it arrives, so a
 * run that dies halfway still has a trace to read afterwards. A log collected
 * in memory and saved at the end is only durable for the runs that did not
 * need it.
 *
 * Authorization lives here rather than in the route, so the decision and the
 * write it guards cannot drift apart, and so a test can drive both without
 * standing up a request.
 */

import type { Prisma, PrismaClient, RunStatus } from "@prisma/client";

import { authorize } from "../authorize";
import type { RunFailed, StreamedEvent } from "../events";
import { appendRunEvents, finalizeRun } from "../repositories/runs";
import { ServiceError } from "../service";
import { principalFor } from "../session";
import type { StepCost, StepOutcome, StepVerification, TraceStatus, TraceStep } from "../trace";
import { foldTrace } from "../trace";

export interface StartRunInput {
  userId: string;
  programId: string;
  method: string;
  seed: number;
  useSmt: boolean;
  proveFinal: boolean;
  maxIterations?: number;
  nodeBudget: number | null;
}

/** Everything the caller needs to actually run the thing it just created. */
export interface StartedRun {
  ok: true;
  runId: string;
  source: string;
  category: string;
}

export type StartRunResult =
  | StartedRun
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Create the Run row for a stored program, if the caller may.
 *
 * The program carries the workspace, by the one path a program has to one, so
 * the permission question is answered off the row being acted on rather than
 * off anything the request claimed.
 */
export async function startRun(
  db: PrismaClient,
  input: StartRunInput,
): Promise<StartRunResult> {
  const program = await db.program.findUnique({
    where: { id: input.programId },
    select: {
      id: true,
      source: true,
      category: true,
      project: { select: { workspaceId: true } },
    },
  });
  if (program === null) return { ok: false, reason: "not_found" };

  const principal = await principalFor(db, input.userId, program.project.workspaceId);
  // A stranger to the workspace is told the program is not there. Refusing them
  // by name would confirm an id to someone who only guessed it, and they cannot
  // tell the two answers apart anyway.
  if (principal.role === null) return { ok: false, reason: "not_found" };
  if (!authorize(principal, "run:start")) return { ok: false, reason: "forbidden" };

  const run = await db.run.create({
    data: {
      programId: program.id,
      startedById: input.userId,
      method: input.method,
      seed: input.seed,
      // The rest of the request as sent, so the run can be repeated exactly.
      config: {
        useSmt: input.useSmt,
        proveFinal: input.proveFinal,
        maxIterations: input.maxIterations ?? null,
        nodeBudget: input.nodeBudget,
        category: program.category,
      },
      // RUNNING, not QUEUED: the engine is called on this request, so the row
      // is never waiting for anything.
      status: "RUNNING",
    },
    select: { id: true },
  });

  return { ok: true, runId: run.id, source: program.source, category: program.category };
}

/**
 * What the client is told when a run dies after the response has begun.
 *
 * The status code is spent by then, so the failure has to travel as an event.
 * Same shape the compute service uses, which is what lets the stored trace and
 * the one the browser rendered be the same trace.
 */
export function runFailure(runId: string, error: unknown): RunFailed {
  const service = error instanceof ServiceError;
  return {
    kind: "run_failed",
    run_id: runId,
    // The engine's numbering stopped wherever it stopped. This event is not
    // part of it, and the stored ordering key is assigned on write anyway.
    seq: 0,
    message: service ? error.message : "the run could not be completed",
    error_type: service ? "ServiceError" : "Error",
  };
}

/** A step with the numbers a Transformation row is made of. */
interface MeasuredStep extends TraceStep {
  site: number;
  cost: StepCost;
  verification: StepVerification;
  outcome: StepOutcome;
}

/**
 * Transformation columns are not nullable, and a step the engine threw out
 * before pricing or verifying it has nothing to put in them. Zeroes would read
 * as measurements nobody took, so those attempts stay in the decision log,
 * which has the whole of them, and out of the table that gets summed.
 */
function measured(step: TraceStep): step is MeasuredStep {
  return (
    step.site !== null &&
    step.cost !== null &&
    step.verification !== null &&
    step.outcome !== null
  );
}

const FINAL_STATUS: Record<TraceStatus, RunStatus> = {
  converged: "SUCCEEDED",
  failed: "FAILED",
  // No terminal event ever arrived. Somebody stopped listening, or the process
  // went away. Either way it is not a success and it is not still going.
  streaming: "ABANDONED",
};

const ABANDONED_REASON = "the stream ended before the run converged";

/**
 * Z3's last word on the run.
 *
 * Read off the raw events rather than the folded steps because a proof asked
 * for after the last rewrite has no step to belong to, and the fold has nowhere
 * to put a verdict that arrives with nothing open.
 */
function finalProof(events: readonly StreamedEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.kind === "verification_result" && event.method === "smt_z3") {
      return event.verdict;
    }
  }
  return null;
}

/**
 * Writes a decision log down as it is produced.
 *
 * Keeps every event it has seen, because finishing a run means answering what
 * it cost and whether the output still matched, and the fold that answers that
 * already exists. Reading the rows back to work it out a second way would be
 * two implementations of one question, which is one too many.
 */
export class RunRecorder {
  private readonly seen: StreamedEvent[] = [];
  /** Arrival order, which is the order the trace is replayed in. */
  private seq = 0;
  private settledWritten = 0;

  constructor(
    private readonly db: PrismaClient,
    private readonly runId: string,
  ) {}

  /**
   * Store one event, and any transformation it completed.
   *
   * A row per event rather than a batch. Batching would cost fewer round trips
   * and would lose the tail of every run that died partway, and the run that
   * died partway is the one this exists for.
   */
  async record(event: StreamedEvent): Promise<void> {
    this.seen.push(event);
    await appendRunEvents(this.db, this.runId, [
      {
        seq: this.seq,
        kind: event.kind,
        // The engine's event, whole. Its own seq stays in the payload; the
        // column is arrival order, which a synthesized failure also has.
        payload: event as unknown as Prisma.InputJsonValue,
      },
    ]);
    this.seq += 1;

    // A decision is the only event that closes a step, so the fold runs there
    // and nowhere else.
    if (event.kind === "decision") await this.writeTransformations();
  }

  /**
   * Close the run out from what the stream actually said.
   *
   * Every exit from a run goes through here, including the ones nobody
   * planned: a row left RUNNING is a run that never ends, and there is nothing
   * later that would come along and correct it.
   */
  async finish(): Promise<RunStatus> {
    const { summary } = foldTrace(this.seen);
    const status = FINAL_STATUS[summary.status];

    await finalizeRun(this.db, this.runId, {
      status,
      costBefore: summary.costBefore?.weighted_total ?? null,
      costAfter: summary.costAfter?.weighted_total ?? null,
      outputMatch: summary.outputMatch,
      finalProof: finalProof(this.seen),
      error:
        status === "ABANDONED" ? ABANDONED_REASON : (summary.failure?.message ?? null),
    });

    return status;
  }

  /** Rows for the steps that have settled since the last decision. */
  private async writeTransformations(): Promise<void> {
    const settled = foldTrace(this.seen).steps.filter((step) => step.outcome !== null);
    // Steps settle in the order they were opened, so the ones not yet written
    // are always the tail of that list.
    const fresh = settled.slice(this.settledWritten);
    this.settledWritten = settled.length;

    const rows = fresh.filter(measured).map((step) => ({
      runId: this.runId,
      kind: step.optimizationType,
      site: step.site,
      costBefore: step.cost.before.weighted_total,
      costAfter: step.cost.after.weighted_total,
      verificationMethod: step.verification.method,
      verificationVerdict: step.verification.verdict,
      accepted: step.outcome.accepted,
      rejectReason: step.outcome.rejectReason,
    }));
    if (rows.length === 0) return;

    await this.db.transformation.createMany({ data: rows });
  }
}
