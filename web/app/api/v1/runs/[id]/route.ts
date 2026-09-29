import { type NextRequest } from "next/server";

import { json, keyError } from "@/lib/api/http";
import { authenticateKey } from "@/lib/api/keys";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateKey(prisma, request.headers.get("authorization"), "runs:read");
  if (!auth.ok) return keyError(auth);
  const { id } = await params;
  const run = await prisma.run.findFirst({
    where: { id, program: { project: { workspaceId: auth.principal.workspaceId } } },
    select: {
      id: true, programId: true, method: true, seed: true, config: true, status: true,
      costBefore: true, costAfter: true, outputMatch: true, finalProof: true, error: true,
      startedAt: true, finishedAt: true,
      events: { select: { seq: true, payload: true }, orderBy: { seq: "asc" } },
    },
  });
  if (!run) return json({ error: "no such run" }, 404);
  return json({ run });
}
