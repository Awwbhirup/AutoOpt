import { type NextRequest } from "next/server";
import { z } from "zod";

import { json, keyError } from "@/lib/api/http";
import { authenticateKey } from "@/lib/api/keys";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await authenticateKey(prisma, request.headers.get("authorization"), "runs:read");
  if (!auth.ok) return keyError(auth);

  const limit = z.coerce.number().int().min(1).max(100).safeParse(
    request.nextUrl.searchParams.get("limit") ?? "50",
  );
  if (!limit.success) return json({ error: "limit must be between 1 and 100" }, 422);
  const rows = await prisma.run.findMany({
    where: { program: { project: { workspaceId: auth.principal.workspaceId } } },
    select: {
      id: true, programId: true, method: true, seed: true, status: true,
      costBefore: true, costAfter: true, outputMatch: true, startedAt: true, finishedAt: true,
    },
    orderBy: { startedAt: "desc" },
    take: limit.data,
  });
  return json({ runs: rows });
}
