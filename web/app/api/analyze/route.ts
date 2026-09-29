/**
 * The playground's live analysis: TAC, CFG and dataflow facts for whatever is
 * in the editor. Public like /api/optimize, since the playground is.
 *
 * Always answers 200 with one of three shapes, so the editor can tell a
 * program with a mistake in it from an engine that is not there.
 */

import { z } from "zod";

import { analyzeSource, SourceError } from "@/lib/service";

export const runtime = "nodejs";

const body = z.object({ source: z.string().max(8_000) });

export type AnalyzeResponse =
  | { status: "ok"; result: Awaited<ReturnType<typeof analyzeSource>> }
  | { status: "invalid"; diagnostic: SourceError["diagnostic"] }
  | { status: "offline" };

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "send a source of at most 8000 characters" }, { status: 422 });

  let answer: AnalyzeResponse;
  try {
    answer = { status: "ok", result: await analyzeSource(parsed.data.source, request.signal) };
  } catch (error) {
    answer = error instanceof SourceError ? { status: "invalid", diagnostic: error.diagnostic } : { status: "offline" };
  }
  return Response.json(answer, { headers: { "cache-control": "no-store" } });
}
