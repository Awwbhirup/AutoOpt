"use client";

/**
 * Revoking a share link. Optimistic: the control reads "revoked" as soon as
 * it is pressed, since revoking cannot conflict with anything, and goes back
 * to a button if the server refuses.
 */

import { useActionState, useOptimistic } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { revokeShareLink } from "@/lib/actions/shares";

export function RevokeShare({ slug, shareId }: { slug: string; shareId: string }) {
  const toast = useToast();
  const [revoked, markRevoked] = useOptimistic(false);
  const [, revoke] = useActionState(async (previous: ActionState, form: FormData) => {
    markRevoked(true);
    const next = await revokeShareLink(previous, form);
    toast(
      next.error
        ? { title: "Not revoked", description: next.error, tone: "refused" }
        : { title: "Link revoked", description: "It stops working now." },
    );
    return next;
  }, IDLE);

  if (revoked) return <span className="px-2.5 text-xs text-muted">revoked</span>;

  return (
    <form action={revoke}>
      <input type="hidden" name="workspace" value={slug} />
      <input type="hidden" name="shareId" value={shareId} />
      <Button type="submit" size="sm" variant="ghost" className="hover:text-refused">
        Revoke
      </Button>
    </form>
  );
}
