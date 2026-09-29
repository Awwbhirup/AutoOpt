/**
 * What the command palette can jump to in a workspace: its programs, suites
 * and most recent runs. Fetched when the palette first opens rather than with
 * every page, since most page views never open it.
 */

import { auth } from "@/auth";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { methodLabel } from "@/lib/methods";
import { findWorkspaceBySlug } from "@/lib/repositories/workspaces";
import { principalFor } from "@/lib/session";
import { percentReduction } from "@/lib/trace";

export const runtime = "nodejs";

export interface PaletteData {
  programs: { id: string; name: string; project: string }[];
  suites: { id: string; name: string }[];
  runs: { id: string; program: string; method: string; status: string; reduction: number | null }[];
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) return new Response(null, { status: 404 });
  const principal = await principalFor(prisma, userId, workspace.id);
  if (!authorize(principal, "run:view")) return new Response(null, { status: 404 });

  const [programs, suites, runs] = await Promise.all([
    prisma.program.findMany({
      where: { project: { workspaceId: workspace.id } },
      select: { id: true, name: true, project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.benchmarkSuite.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.run.findMany({
      where: { program: { project: { workspaceId: workspace.id } } },
      select: {
        id: true,
        method: true,
        status: true,
        costBefore: true,
        costAfter: true,
        program: { select: { name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 15,
    }),
  ]);

  const data: PaletteData = {
    programs: programs.map((program) => ({ id: program.id, name: program.name, project: program.project.name })),
    suites,
    runs: runs.map((run) => ({
      id: run.id,
      program: run.program.name,
      method: methodLabel(run.method),
      status: run.status.toLowerCase(),
      reduction:
        run.costBefore === null || run.costAfter === null ? null : percentReduction(run.costBefore, run.costAfter),
    })),
  };
  return Response.json(data, { headers: { "cache-control": "private, no-store" } });
}
