import type { PrismaClient } from "@prisma/client";

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function consumeWorkspaceRun(
  db: PrismaClient,
  workspaceId: string,
  now = new Date(),
): Promise<boolean> {
  const periodStart = monthStart(now);
  await db.quota.upsert({
    where: { workspaceId },
    create: { workspaceId, periodStart },
    update: {},
  });
  await db.quota.updateMany({
    where: { workspaceId, periodStart: { lt: periodStart } },
    data: { periodStart, usedRuns: 0 },
  });
  const result = await db.quota.updateMany({
    where: { workspaceId, usedRuns: { lt: db.quota.fields.monthlyRuns } },
    data: { usedRuns: { increment: 1 } },
  });
  return result.count === 1;
}
