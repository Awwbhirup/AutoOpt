"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthFormState } from "@/lib/actions/auth";

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

const PROBLEM = "mt-1 text-sm text-red-600 dark:text-red-400";

export default function SignUpPage() {
  const [state, submit, pending] = useActionState(signUp, EMPTY);
  const { fieldErrors } = state;

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Create an account
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        You get a workspace of your own to put programs in.
      </p>

      <form action={submit} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="name" className={LABEL}>
            Name{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-500">
              (optional)
            </span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={state.values.name}
            aria-invalid={fieldErrors.name !== undefined}
            className={INPUT}
          />
          {fieldErrors.name && <p className={PROBLEM}>{fieldErrors.name}</p>}
        </div>

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
            aria-invalid={fieldErrors.email !== undefined}
            className={INPUT}
          />
          {fieldErrors.email && <p className={PROBLEM}>{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={fieldErrors.password !== undefined}
            className={INPUT}
          />
          {fieldErrors.password ? (
            <p className={PROBLEM}>{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
              At least 10 characters.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Creating" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Already have one?{" "}
        <Link
          href="/signin"
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
