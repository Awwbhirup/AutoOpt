"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  signInWithGitHub,
  signInWithPassword,
  type AuthFormState,
} from "@/lib/actions/auth";

const EMPTY: AuthFormState = {
  error: null,
  fieldErrors: {},
  values: { name: "", email: "" },
};

const LABEL = "text-sm font-medium text-zinc-800 dark:text-zinc-200";

const INPUT =
  "mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500";

const PRIMARY =
  "w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

const SECONDARY =
  "w-full rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900";

export default function SignInPage() {
  const [state, submit, pending] = useActionState(signInWithPassword, EMPTY);

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Sign in
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        To your workspaces and the decision log of every run in them.
      </p>

      {/* Its own form: submitting it leaves for GitHub and takes nothing with it. */}
      <form action={signInWithGitHub} className="mt-6">
        <button type="submit" className={SECONDARY}>
          Continue with GitHub
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <form action={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values.email}
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={INPUT}
          />
        </div>

        {state.error && (
          <p
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Signing in" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        No account yet?{" "}
        <Link
          href="/signup"
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
