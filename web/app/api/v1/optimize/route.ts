import { type NextRequest } from "next/server";
import { z } from "zod";

import { runFailure, RunRecorder } from "@/lib/actions/runs";
import { json, keyError } from "@/lib/api/http";
import { authenticateKey } from "@/lib/api/keys";
import { consumeWorkspaceRun } from "@/lib/api/quota";
import { prisma } from "@/lib/db";
import type { StreamedEvent } from "@/lib/events";
import { methods, optimize } from "@/lib/service";

export const runtime = "nodejs";

const body = z.object({
  programId: z.string().min(1),
  method: z.string().default("greedy"),
  seed: z.number().int().nonnegative().default(0),
  useSmt: z.boolean().default(false),
  proveFinal: z.boolean().default(false),
  maxIterations: z.number().int().min(1).max(1_000).optional(),
  nodeBudget: z.number().int().positive().nullable().default(null),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateKey(prisma, request.headers.get("authorization"), "runs:write");
  if (!auth.ok) return keyError(auth);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "send a programId and valid run options" }, 422);
  const options = parsed.data;

  const program = await prisma.program.findFirst({
    where: { id: options.programId, project: { workspaceId: auth.principal.workspaceId } },
    select: { id: true, source: true, category: true },
  });
  if (!program) return json({ error: "no such program" }, 404);
  if (program.source.length > 8_000) {
    return json({ error: "program source exceeds the compute limit" }, 422);
  }

  try {
    const available = await methods(AbortSignal.timeout(2500));
    const selected = available.find((item) => item.name === options.method);
    if (!selected) return json({ error: "unknown method" }, 422);
    if (!selected.available) return json({ error: "method is unavailable" }, 503);
  } catch {
    return json({ error: "compute service is offline" }, 503);
  }

  if (!(await consumeWorkspaceRun(prisma, auth.principal.workspaceId))) {
    return json({ error: "monthly run quota reached" }, 429);
  }

  const run = await prisma.run.create({
    data: {
      programId: program.id,
      startedById: auth.principal.createdById,
      method: options.method,
      seed: options.seed,
      config: {
        useSmt: options.useSmt,
        proveFinal: options.proveFinal,
        maxIterations: options.maxIterations ?? null,
        nodeBudget: options.nodeBudget,
        category: program.category,
      },
      status: "RUNNING",
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      workspaceId: auth.principal.workspaceId,
      actorId: auth.principal.createdById,
      action: "api.run.started",
      resourceType: "Run",
      resourceId: run.id,
      metadata: { keyId: auth.principal.id },
    },
  });

  const recorder = new RunRecorder(prisma, run.id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamedEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        try {
          for await (const event of optimize({
            source: program.source,
            category: program.category,
            ...options,
            signal: request.signal,
          })) {
            send(event);
            await recorder.record(event);
          }
        } catch (error) {
          if (!request.signal.aborted) {
            const failure = runFailure(run.id, error);
            send(failure);
            await recorder.record(failure);
          }
        } finally {
          await recorder.finish();
        }
      } catch (error) {
        console.error(`run ${run.id} could not be finalized`, error);
      } finally {
        try {
          controller.close();
        } catch {
          // The caller disconnected.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "x-run-id": run.id,
    },
  });
}
