"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/surface";
import { signUp, type AuthFormState } from "@/lib/actions/auth";

const EMPTY: AuthFormState = {
  error: null,
  fieldErrors: {},
  values: { name: "", email: "" },
};

export default function SignUpPage() {
  const [state, submit, pending] = useActionState(signUp, EMPTY);
  const { fieldErrors } = state;

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm leading-relaxed text-foreground/75">
        You get a workspace of your own to put programs in.
      </p>

      <form action={submit} className="mt-6 flex flex-col gap-4">
        <Field label="Name (optional)" htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={state.values.name}
            aria-invalid={fieldErrors.name !== undefined || undefined}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values.email}
            aria-invalid={fieldErrors.email !== undefined || undefined}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={fieldErrors.password}
          hint="At least 10 characters."
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={fieldErrors.password !== undefined || undefined}
          />
        </Field>

        {state.error ? <Callout tone="refused">{state.error}</Callout> : null}

        <Button type="submit" variant="primary" pending={pending} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-sm text-foreground/75">
        Already have one?{" "}
        <Link href="/signin" className="ui-focus font-semibold text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
