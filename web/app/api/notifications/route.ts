/** The signed-in user's latest notifications and how many are unread. */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listNotifications, unreadCount } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });
  const [items, unread] = await Promise.all([listNotifications(prisma, userId), unreadCount(prisma, userId)]);
  return Response.json({ items, unread }, { headers: { "cache-control": "private, no-store" } });
}
