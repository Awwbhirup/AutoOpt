/**
 * Runs one program and streams the decision log back to the browser.
 *
 * A pass-through rather than a buffer: the compute service produces events as
 * it goes and they are forwarded as they arrive, because a trace that appears
 * all at once is just a result with extra steps.
 *
 * Nothing is persisted here yet. That belongs with the run pages, where there
 * is a workspace to attribute a run to.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";

import { optimize, ServiceError } from "@/lib/service";

// The engine is synchronous Python behind an HTTP call, so this cannot run on
// the edge runtime.
export const runtime = "nodejs";

const body = z.object({
  source: z.string().min(1).max(8_000),
  method: z.string().default("greedy"),
  proveFinal: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "send a source and a method" }, { status: 422 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of optimize(parsed.data)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (error) {
        // The response has already begun, so this is the only way left to say
        // what went wrong.
        const message =
          error instanceof ServiceError ? error.message : "the run could not be completed";
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              kind: "run_failed",
              run_id: "demo",
              seq: 0,
              message,
              error_type: "ServiceError",
            }) + "\n",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
