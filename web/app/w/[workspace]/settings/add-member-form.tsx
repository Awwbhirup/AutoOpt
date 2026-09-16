"use client";

/**
 * Adding someone to the workspace.
 *
 * The workspace travels as its slug, the same string the URL carries, and the
 * action resolves it again rather than believing a hidden id. Whether this form
 * is shown at all is decided on the server; this is convenience, not the check.
 */

import { useActionState, useState } from "react";

import { addWorkspaceMember } from "@/lib/actions/members";
import { IDLE } from "@/lib/actions/form";

const FIELD =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

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
      className="flex flex-wrap items-end gap-2 px-3 py-3"
    >
      <input type="hidden" name="workspace" value={slug} />

      <div className="min-w-[16rem] flex-1">
        <label
          htmlFor="member-email"
          className="block text-xs text-zinc-500 dark:text-zinc-400"
        >
          Email
        </label>
        <input
          id="member-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="someone@example.com"
          className={FIELD}
        />
      </div>

      <div className="min-w-[8rem]">
        <label
          htmlFor="member-role"
          className="block text-xs text-zinc-500 dark:text-zinc-400"
        >
          Role
        </label>
        <select id="member-role" name="role" defaultValue="MEMBER" className={FIELD}>
          {mayGrantOwner ? <option value="OWNER">Owner</option> : null}
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
          <option value="VIEWER">Viewer</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Adding" : "Add"}
      </button>

      <p className="w-full text-xs text-zinc-500 dark:text-zinc-400">
        They need an account already. There are no pending invitations yet.
      </p>

      {state.error === null ? null : (
        <p role="alert" className="w-full text-sm text-rose-700 dark:text-rose-400">
          {state.error}
        </p>
      )}
      {state.createdId === null ? null : (
        <p className="w-full text-sm text-zinc-600 dark:text-zinc-400">
          Added. They are in the list below.
        </p>
      )}
    </form>
  );
}
