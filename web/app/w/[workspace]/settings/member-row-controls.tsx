"use client";

/**
 * The role selector and the remove button on one row of the member list.
 *
 * Both are forms rather than buttons with handlers, so each posts to the server
 * action that owns the rule it is subject to. Neither decides anything: the
 * last-owner rule and "only an owner may touch an owner" are enforced in the
 * action, and what is disabled here only spares someone a refusal they were
 * always going to get.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/input";
import {
  changeWorkspaceMemberRole,
  removeWorkspaceMember,
} from "@/lib/actions/members";
import { IDLE } from "@/lib/actions/form";
import type { Role } from "@/lib/authorize";

const ROLE_LABELS: Array<[Role, string]> = [
  ["OWNER", "Owner"],
  ["ADMIN", "Admin"],
  ["MEMBER", "Member"],
  ["VIEWER", "Viewer"],
];

export function MemberRowControls({
  slug,
  userId,
  role,
  mayChangeRole,
  mayRemove,
  isSelf,
  isLastOwner,
}: {
  slug: string;
  userId: string;
  role: Role;
  mayChangeRole: boolean;
  mayRemove: boolean;
  /** The caller's own row, worth marking because demoting yourself is allowed. */
  isSelf: boolean;
  isLastOwner: boolean;
}) {
  const [roleState, changeRole, changing] = useActionState(
    changeWorkspaceMemberRole,
    IDLE,
  );
  const [removeState, remove, removing] = useActionState(
    removeWorkspaceMember,
    IDLE,
  );

  const frozen = isLastOwner;
  const problem = roleState.error ?? removeState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {mayChangeRole ? (
        <form action={changeRole} className="flex items-center gap-1">
          <input type="hidden" name="workspace" value={slug} />
          <input type="hidden" name="userId" value={userId} />
          <label htmlFor={`role-${userId}`} className="sr-only">
            Role
          </label>
          <select
            id={`role-${userId}`}
            name="role"
            defaultValue={role}
            disabled={changing || frozen}
            // Submitting on change rather than behind a Save button: there is
            // one field, and a button that has to be found to commit a visibly
            // changed dropdown is how a role silently does not change.
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className={fieldClass("h-7 px-2 text-xs")}
          >
            {ROLE_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <span className="text-xs text-muted">
          {role.toLowerCase()}
        </span>
      )}

      {mayRemove ? (
        <form action={remove}>
          <input type="hidden" name="workspace" value={slug} />
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" size="sm" variant="ghost" disabled={frozen} pending={removing} className="hover:text-refused">
            {isSelf ? "Leave" : "Remove"}
          </Button>
        </form>
      ) : null}

      {frozen ? (
        <span className="text-xs text-muted">
          only owner
        </span>
      ) : null}

      {problem === null ? null : (
        <p role="alert" className="w-full text-right text-xs text-refused">
          {problem}
        </p>
      )}
    </div>
  );
}
