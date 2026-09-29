"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { authorize } from "@/lib/authorize";
import { createKey, revokeKey } from "@/lib/api/keys";
import { keyScope } from "@/lib/api/scopes";
import { prisma } from "@/lib/db";
import { findWorkspaceBySlug } from "@/lib/repositories/workspaces";
import { principalFor } from "@/lib/session";

export type KeyActionState = { error: string | null; key: string | null };

async function caller(slug: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (!workspace) return null;
  const principal = await principalFor(prisma, userId, workspace.id);
  if (!authorize(principal, "apiKey:manage")) return null;
  return { userId, workspace };
}

export async function createApiKey(
  _previous: KeyActionState,
  form: FormData,
): Promise<KeyActionState> {
  const slug = String(form.get("workspace") ?? "");
  const access = await caller(slug);
  if (!access) return { error: "Only workspace admins can manage keys.", key: null };

  const name = String(form.get("name") ?? "").trim();
  const scopes = keyScope.array().min(1).safeParse(form.getAll("scope"));
  if (name.length < 1 || name.length > 80 || !scopes.success) {
    return { error: "Give the key a name and at least one scope.", key: null };
  }
  const expiry = String(form.get("expiry") ?? "never");
  if (!["never", "30d", "90d"].includes(expiry)) {
    return { error: "Choose a valid expiry.", key: null };
  }
  const expiresAt = expiry === "never"
    ? null
    : new Date(Date.now() + (expiry === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000);
  const created = await createKey(prisma, {
    workspaceId: access.workspace.id,
    createdById: access.userId,
    name,
    scopes: scopes.data,
    expiresAt,
  });
  revalidatePath(`/w/${slug}/settings/api-keys`);
  return { error: null, key: created.key };
}

export async function revokeApiKey(form: FormData): Promise<void> {
  const slug = String(form.get("workspace") ?? "");
  const access = await caller(slug);
  if (!access) return;
  const keyId = String(form.get("keyId") ?? "");
  if (!keyId) return;
  await revokeKey(prisma, {
    keyId,
    workspaceId: access.workspace.id,
    actorId: access.userId,
  });
  revalidatePath(`/w/${slug}/settings/api-keys`);
}
