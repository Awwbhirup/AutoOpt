import type { PrismaClient } from "@prisma/client";

export async function consumeKeyRequest(db: PrismaClient, keyId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "ApiKey"
    SET "windowStart" = CASE
          WHEN "windowStart" <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
          THEN CURRENT_TIMESTAMP ELSE "windowStart" END,
        "windowRequests" = CASE
          WHEN "windowStart" <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
          THEN 1 ELSE "windowRequests" + 1 END,
        "lastUsedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${keyId}
      AND "revokedAt" IS NULL
      AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
      AND (
        "windowStart" <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
        OR "windowRequests" < "requestsPerMinute"
      )
    RETURNING "id"
  `;
  return rows.length === 1;
}
