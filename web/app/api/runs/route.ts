/**
 * Starts a run on a stored program, streams the decision log back, and writes
 * it down at the same time.
 *
 * Each event goes out to the client before it is written down, so no decision
 * waits on a round trip to show up. The write is still awaited before the next
 * event is pulled, which is what makes the stored order the arrival order.
 *
 * The run row is closed out on every way out of this handler, including the one
 * where the browser walks off mid-stream: nothing else in the system would come
 * along later and correct a row left RUNNING.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { RunRecorder, runFailure, startRun } from "@/lib/actions/runs";
import { prisma } from "@/lib/db";
import type { StreamedEvent } from "@/lib/events";
import { optimize } from "@/lib/service";

// The engine is synchronous Python behind an HTTP call, so this cannot run on
// the edge runtime.
export const runtime = "nodejs";

const body = z.object({
  programId: z.string().min(1),
  method: z.string().default("greedy"),
  seed: z.number().int().default(0),
  useSmt: z.boolean().default(false),
  proveFinal: z.boolean().default(false),
  maxIterations: z.number().int().positive().optional(),
  nodeBudget: z.number().int().positive().nullable().default(null),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "sign in to start a run" }, { status: 401 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "send a programId and a method" }, { status: 422 });
  }
  const options = parsed.data;

  const started = await startRun(prisma, { userId, ...options });
  if (!started.ok) {
    return started.reason === "forbidden"
      ? Response.json({ error: "not allowed to start a run here" }, { status: 403 })
      : Response.json({ error: "no such program" }, { status: 404 });
  }

  const recorder = new RunRecorder(prisma, started.runId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamedEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        try {
          for await (const event of optimize({
            source: started.source,
            category: started.category,
            programId: options.programId,
            method: options.method,
            seed: options.seed,
            useSmt: options.useSmt,
            proveFinal: options.proveFinal,
            maxIterations: options.maxIterations,
            nodeBudget: options.nodeBudget,
            signal: request.signal,
          })) {
            send(event);
            await recorder.record(event);
          }
        } catch (error) {
          // A browser that goes away aborts the upstream fetch, which arrives
          // here looking like any other failure. It is not one: nothing went
          // wrong with the run, there is just nobody left to send it to, and
          // saying FAILED would blame the engine for the reader leaving.
          if (!request.signal.aborted) {
            const failure = runFailure(started.runId, error);
            send(failure);
            await recorder.record(failure);
          }
        } finally {
          await recorder.finish();
        }
      } catch (error) {
        // Reached only when the database itself is unreachable, at which point
        // the row cannot be corrected from here and the log is all that is left.
        console.error(`run ${started.runId} could not be finalized`, error);
      } finally {
        // The stream may already have been torn down by the disconnect that
        // brought us here, and closing a dead one throws.
        try {
          controller.close();
        } catch {
          // Nobody is reading.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      // Where the trace is being kept, so the client can link to it without
      // waiting for the run to end.
      "x-run-id": started.runId,
    },
  });
}
