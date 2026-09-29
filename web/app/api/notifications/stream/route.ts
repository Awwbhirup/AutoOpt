/**
 * Server-sent events for the notification bell: the unread count and the
 * newest notification's id, sent when either changes. Polls the table every
 * few seconds rather than holding a subscription, which works the same on a
 * serverless host; the stream closes before the platform's time limit and the
 * browser's EventSource reconnects on its own.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TICK_MS = 5000;
const OPEN_FOR_MS = 280_000;

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  const encoder = new TextEncoder();
  const openedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      try {
        while (!request.signal.aborted && Date.now() - openedAt < OPEN_FOR_MS) {
          const [unread, newest] = await Promise.all([
            prisma.notification.count({ where: { userId, readAt: null } }),
            prisma.notification.findFirst({
              where: { userId },
              orderBy: { createdAt: "desc" },
              select: { id: true, title: true, body: true },
            }),
          ]);
          const snapshot = { unread, newest };
          const key = JSON.stringify(snapshot);
          if (key !== last) {
            controller.enqueue(encoder.encode(`event: notifications\ndata: ${key}\n\n`));
            last = key;
          }
          await new Promise((resolve) => setTimeout(resolve, TICK_MS));
        }
      } catch (error) {
        console.error("notification stream failed", error);
      } finally {
        try {
          controller.close();
        } catch {
          // The client left first.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
