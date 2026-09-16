"use client";

/**
 * The create-project form.
 *
 * The workspace travels as its slug, the same string the URL carries, and the
 * action resolves it again rather than believing a hidden id. Whether the form
 * is shown at all is decided on the server; this is convenience, not the check.
 */

import { useActionState, useState } from "react";

import { IDLE } from "@/lib/actions/form";
import { createProject } from "@/lib/actions/projects";

const FIELD =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function NewProjectForm({ slug }: { slug: string }) {
  const [state, submit, pending] = useActionState(createProject, IDLE);

  // Kept rather than read off the state, which goes back to null on the next
  // refusal. Keying on the state itself would remount the form on that
  // refusal too, clearing the fields the person is being asked to correct.
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  if (state.createdId !== null && state.createdId !== lastCreated) {
    setLastCreated(state.createdId);
  }

  return (
    <form
      // Remounted on success, which is what clears the fields. The state above
      // survives it, so the confirmation below still has the new id.
      key={lastCreated ?? "new"}
      action={submit}
      className="flex flex-wrap items-end gap-2 px-3 py-3"
    >
      <input type="hidden" name="workspace" value={slug} />

      <div className="min-w-[12rem] flex-1">
        <label
          htmlFor="project-name"
          className="block text-xs text-zinc-500 dark:text-zinc-400"
        >
          Name
        </label>
        <input
          id="project-name"
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Front end"
          className={FIELD}
        />
      </div>

      <div className="min-w-[16rem] flex-[2]">
        <label
          htmlFor="project-description"
          className="block text-xs text-zinc-500 dark:text-zinc-400"
        >
          Description
        </label>
        <input
          id="project-description"
          name="description"
          maxLength={500}
          autoComplete="off"
          placeholder="Optional"
          className={FIELD}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Creating" : "Create project"}
      </button>

      {state.error === null ? null : (
        <p role="alert" className="w-full text-sm text-rose-700 dark:text-rose-400">
          {state.error}
        </p>
      )}
      {state.createdId === null ? null : (
        <p className="w-full text-sm text-zinc-600 dark:text-zinc-400">
          Created. It is in the list below.
        </p>
      )}
    </form>
  );
}
