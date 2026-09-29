import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import type { KeyScope } from "./scopes";
import { consumeKeyRequest } from "./rate-limit";

export function newKey(): string {
  return `ao_${randomBytes(32).toString("base64url")}`;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function createKey(
  db: PrismaClient,
  input: {
    workspaceId: string;
    createdById: string;
    name: string;
    scopes: KeyScope[];
    expiresAt?: Date | null;
  },
): Promise<{ id: string; key: string }> {
  const key = newKey();
  const row = await db.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.createdById,
        name: input.name,
        hash: hashKey(key),
        prefix: key.slice(0, 11),
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.createdById,
        action: "api_key.created",
        resourceType: "ApiKey",
        resourceId: created.id,
        metadata: { name: input.name, scopes: input.scopes },
      },
    });
    return created;
  });
  return { id: row.id, key };
}

export async function revokeKey(
  db: PrismaClient,
  input: { keyId: string; workspaceId: string; actorId: string },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const result = await tx.apiKey.updateMany({
      where: { id: input.keyId, workspaceId: input.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return false;
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "api_key.revoked",
        resourceType: "ApiKey",
        resourceId: input.keyId,
      },
    });
    return true;
  });
}

export type KeyPrincipal = {
  id: string;
  workspaceId: string;
  createdById: string | null;
};

export type KeyAuth =
  | { ok: true; principal: KeyPrincipal }
  | { ok: false; status: 401 | 403 | 429; error: string };

export async function authenticateKey(
  db: PrismaClient,
  authorization: string | null,
  scope: KeyScope,
  now = new Date(),
): Promise<KeyAuth> {
  const match = /^Bearer (ao_[A-Za-z0-9_-]+)$/.exec(authorization ?? "");
  if (!match) return { ok: false, status: 401, error: "send a valid bearer key" };

  const row = await db.apiKey.findUnique({
    where: { hash: hashKey(match[1]) },
    select: {
      id: true, workspaceId: true, createdById: true, scopes: true,
      revokedAt: true, expiresAt: true,
    },
  });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) {
    return { ok: false, status: 401, error: "key is invalid or expired" };
  }
  if (!row.scopes.includes(scope)) {
    return { ok: false, status: 403, error: `key needs ${scope}` };
  }

  if (!(await consumeKeyRequest(db, row.id))) {
    return { ok: false, status: 429, error: "key rate limit reached" };
  }
  return {
    ok: true,
    principal: { id: row.id, workspaceId: row.workspaceId, createdById: row.createdById },
  };
}
