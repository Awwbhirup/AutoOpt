"use client";

/**
 * Adding someone to the workspace.
 *
 * The workspace travels as its slug, the same string the URL carries, and the
 * action resolves it again rather than believing a hidden id. Whether this form
 * is shown at all is decided on the server; this is convenience, not the check.
 */

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Callout } from "@/components/ui/surface";
import { addWorkspaceMember } from "@/lib/actions/members";
import { IDLE } from "@/lib/actions/form";

export function AddMemberForm({
  slug,
  mayGrantOwner,
}: {
  slug: string;
  /** Only an owner may hand out their own level, so only they are offered it. */
  mayGrantOwner: boolean;
}) {
  const [state, submit, pending] = useActionState(addWorkspaceMember, IDLE);

  // Kept rather than read off the state, which goes back to null on the next
  // refusal. Keying on the state itself would remount the form on that refusal
  // too, clearing the address the person is being asked to correct.
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  if (state.createdId !== null && state.createdId !== lastAdded) {
    setLastAdded(state.createdId);
  }

  return (
    <form
      key={lastAdded ?? "new"}
      action={submit}
      className="flex flex-wrap items-end gap-3 px-4 py-4"
    >
      <input type="hidden" name="workspace" value={slug} />

      <Field label="Email" htmlFor="member-email" className="min-w-[16rem] flex-1">
        <Input
          id="member-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="someone@example.com"
        />
      </Field>

      <Field label="Role" htmlFor="member-role" className="min-w-[9rem]">
        <Select id="member-role" name="role" defaultValue="MEMBER">
          {mayGrantOwner ? <option value="OWNER">Owner</option> : null}
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
          <option value="VIEWER">Viewer</option>
        </Select>
      </Field>

      <Button type="submit" variant="primary" pending={pending}>
        Add
      </Button>

      <p className="w-full text-xs text-muted">
        They need an account already. There are no pending invitations yet.
      </p>

      {state.error === null ? null : (
        <Callout tone="refused" className="w-full">
          {state.error}
        </Callout>
      )}
      {state.createdId === null ? null : (
        <p className="w-full text-sm text-accent">Added. They are in the list below.</p>
      )}
    </form>
  );
}
