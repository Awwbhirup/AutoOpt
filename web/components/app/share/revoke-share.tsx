"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { revokeShareLink } from "@/lib/actions/shares";

export function RevokeShare({ slug, shareId }: { slug: string; shareId: string }) {
  const toast = useToast();
  const [, revoke, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const next = await revokeShareLink(previous, form);
    toast(
      next.error
        ? { title: "Not revoked", description: next.error, tone: "refused" }
        : { title: "Link revoked", description: "It stops working now." },
    );
    return next;
  }, IDLE);

  return (
    <form action={revoke}>
      <input type="hidden" name="workspace" value={slug} />
      <input type="hidden" name="shareId" value={shareId} />
      <Button type="submit" size="sm" variant="ghost" pending={pending} className="hover:text-refused">
        Revoke
      </Button>
    </form>
  );
}
