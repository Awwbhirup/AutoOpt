import { type NextRequest } from "next/server";
import { z } from "zod";

import { CATEGORIES } from "@/lib/categories";
import { authenticateKey } from "@/lib/api/keys";
import { json, keyError } from "@/lib/api/http";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createBody = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  source: z.string().min(1).max(8_000),
  category: z.enum(CATEGORIES).default("mixed"),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateKey(prisma, request.headers.get("authorization"), "programs:read");
  if (!auth.ok) return keyError(auth);

  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limit = z.coerce.number().int().min(1).max(100).safeParse(
    request.nextUrl.searchParams.get("limit") ?? "50",
  );
  if (!limit.success) return json({ error: "limit must be between 1 and 100" }, 422);

  const rows = await prisma.program.findMany({
    where: { project: { workspaceId: auth.principal.workspaceId } },
    select: { id: true, projectId: true, name: true, source: true, category: true, createdAt: true },
    orderBy: { id: "asc" },
    take: limit.data + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit.data;
  const programs = rows.slice(0, limit.data);
  return json({ programs, next_cursor: hasMore ? programs.at(-1)?.id : null });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateKey(prisma, request.headers.get("authorization"), "programs:write");
  if (!auth.ok) return keyError(auth);
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "send a projectId, name, and source" }, 422);

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, workspaceId: auth.principal.workspaceId },
    select: { id: true },
  });
  if (!project) return json({ error: "no such project" }, 404);

  const program = await prisma.program.create({
    data: {
      projectId: project.id,
      authorId: auth.principal.createdById,
      name: parsed.data.name,
      source: parsed.data.source,
      category: parsed.data.category,
    },
    select: { id: true, projectId: true, name: true, category: true, createdAt: true },
  });
  await prisma.auditLog.create({
    data: {
      workspaceId: auth.principal.workspaceId,
      actorId: auth.principal.createdById,
      action: "api.program.created",
      resourceType: "Program",
      resourceId: program.id,
      metadata: { keyId: auth.principal.id },
    },
  });
  return json({ program }, 201);
}
