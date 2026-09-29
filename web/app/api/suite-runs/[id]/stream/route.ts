/**
 * Live progress of a suite run, as server-sent events.
 *
 * Reads the table once a second and sends a snapshot when it changes. The
 * worker started with the suite run does the work; if the queue has stalled
 * (runs queued, none running, nothing moved for a while) and the viewer may
 * run suites, this request starts a worker of its own for as long as it is
 * open. Claims are atomic, so that worker and any other cannot collide.
 */

import type { RunStatus } from "@prisma/client";

import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { suiteRunForCaller } from "@/lib/suites/access";
import type { SuiteProgressSnapshot } from "@/lib/suites/progress";
import { workOnSuiteRun } from "@/lib/suites/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TICK_MS = 1000;
/** Nothing moved for this long with runs still queued: the worker is gone. */
const STALL_MS = 8000;
/** Leave room under maxDuration to close the stream cleanly. */
const OPEN_FOR_MS = 280_000;

async function snapshot(suiteRunId: string): Promise<SuiteProgressSnapshot | null> {
  const [suiteRun, counts] = await Promise.all([
    prisma.suiteRun.findUnique({
      where: { id: suiteRunId },
      select: { status: true, total: true },
    }),
    prisma.run.groupBy({ by: ["status"], where: { suiteRunId }, _count: { _all: true } }),
  ]);
  if (suiteRun === null) return null;
  const count = (status: RunStatus) =>
    counts.find((entry) => entry.status === status)?._count._all ?? 0;
  return {
    status: suiteRun.status,
    total: suiteRun.total,
    completed: suiteRun.total - count("QUEUED") - count("RUNNING"),
    running: count("RUNNING"),
    succeeded: count("SUCCEEDED"),
    failed: count("FAILED") + count("ABANDONED"),
  };
}

const FINAL: ReadonlySet<RunStatus> = new Set(["SUCCEEDED", "FAILED", "ABANDONED"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await suiteRunForCaller(id);
  if (!access.ok) return new Response(null, { status: access.status });
  const mayDrive = authorize(access.principal, "suite:run");

  const encoder = new TextEncoder();
  const openedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      let last = "";
      let lastMoved = Date.now();
      let driving = false;

      try {
        while (!request.signal.aborted && Date.now() - openedAt < OPEN_FOR_MS) {
          const current = await snapshot(id);
          if (current === null) break;

          const key = JSON.stringify(current);
          if (key !== last) {
            send("progress", current);
            last = key;
            lastMoved = Date.now();
          }
          if (FINAL.has(current.status) && current.running === 0) {
            send("done", current);
            break;
          }

          const queued = current.total - current.completed - current.running;
          if (
            mayDrive &&
            !driving &&
            queued > 0 &&
            current.running === 0 &&
            Date.now() - lastMoved > STALL_MS
          ) {
            driving = true;
            const budget = OPEN_FOR_MS - (Date.now() - openedAt) - 20_000;
            if (budget > 5_000) {
              void workOnSuiteRun(id, budget).finally(() => {
                driving = false;
              });
            }
          }

          await new Promise((resolve) => setTimeout(resolve, TICK_MS));
        }
      } catch (error) {
        console.error(`suite run ${id} progress stream failed`, error);
      } finally {
        try {
          controller.close();
        } catch {
          // The client went away first.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
