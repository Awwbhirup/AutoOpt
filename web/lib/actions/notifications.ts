"use server";

/** Marking the signed-in user's own notifications read. Nobody else's are reachable. */

import { auth } from "../../auth";
import { prisma } from "../db";

export async function markNotificationsRead(ids: string[] | "all"): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids.slice(0, 100) } }) },
    data: { readAt: new Date() },
  });
}
