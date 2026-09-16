"use client";

/**
 * Adding a program by pasting its source.
 *
 * Pasted rather than uploaded. A program here is a few dozen lines of MiniLang
 * that someone is usually copying out of an editor, and a file picker would put
 * a step in front of the common case.
 *
 * One of these renders per project, so every id it hands out carries the
 * project's, or the labels would all point at the first form on the page.
 */

import Link from "next/link";
import { useActionState, useState } from "react";

import { IDLE } from "@/lib/actions/form";
import { createProgram } from "@/lib/actions/programs";
import { CATEGORIES, categoryLabel, DEFAULT_CATEGORY } from "@/lib/categories";

const FIELD =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function NewProgramForm({
  slug,
  projectId,
}: {
  slug: string;
  projectId: string;
}) {
  const [state, submit, pending] = useActionState(createProgram, IDLE);
  const id = (field: string) => `${projectId}-${field}`;

  // Kept rather than read off the state, which goes back to null on the next
  // refusal. Keying on the state itself would remount the form on that
  // refusal too, and a paste too long to store would be gone before the
  // person could shorten it.
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  if (state.createdId !== null && state.createdId !== lastCreated) {
    setLastCreated(state.createdId);
  }

  return (
    <form
      // Remounted on success, which clears the textarea. The state survives it.
      key={lastCreated ?? "new"}
      action={submit}
      className="space-y-2 border-t border-dashed border-zinc-200 px-3 py-3 dark:border-zinc-800"
    >
      <input type="hidden" name="workspace" value={slug} />
      <input type="hidden" name="projectId" value={projectId} />

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor={id("name")}
            className="block text-xs text-zinc-500 dark:text-zinc-400"
          >
            Name
          </label>
          <input
            id={id("name")}
            name="name"
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Loop sample"
            className={FIELD}
          />
        </div>

        <div>
          <label
            htmlFor={id("category")}
            className="block text-xs text-zinc-500 dark:text-zinc-400"
          >
            Category
          </label>
          <select
            id={id("category")}
            name="category"
            defaultValue={DEFAULT_CATEGORY}
            className={FIELD}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor={id("source")}
          className="block text-xs text-zinc-500 dark:text-zinc-400"
        >
          Source
        </label>
        <textarea
          id={id("source")}
          name="source"
          required
          rows={8}
          spellCheck={false}
          placeholder={"input x;\nint a = 2 + 3;\nprint(a + x);"}
          className={`${FIELD} font-mono text-xs`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Adding" : "Add program"}
        </button>

        {state.error === null ? null : (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {state.error}
          </p>
        )}
        {state.createdId === null ? null : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Added.{" "}
            <Link
              href={`/w/${slug}/programs/${state.createdId}`}
              className="underline underline-offset-2"
            >
              Open it
            </Link>
          </p>
        )}
      </div>
    </form>
  );
}
