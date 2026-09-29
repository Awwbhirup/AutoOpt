"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/surface";
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

export default function SignInPage() {
  const [state, submit, pending] = useActionState(signInWithPassword, EMPTY);

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm leading-relaxed text-foreground/75">
        To your workspaces and the decision log of every run in them.
      </p>

      {/* Its own form: submitting it leaves for GitHub and takes nothing with it. */}
      <form action={signInWithGitHub} className="mt-6">
        <Button type="submit" variant="secondary" className="w-full">
          Continue with GitHub
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={submit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values.email}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>

        {state.error ? <Callout tone="refused">{state.error}</Callout> : null}

        <Button type="submit" variant="primary" pending={pending} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-sm text-foreground/75">
        No account yet?{" "}
        <Link href="/signup" className="ui-focus font-semibold text-foreground underline underline-offset-4">
          Create one
        </Link>
      </p>
    </>
  );
}
