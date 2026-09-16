"use server";

/**
 * Sign-up and sign-in, as server actions.
 *
 * Both forms end at the same call. Sign-up writes the User row when the address
 * is free and then signs in exactly as the sign-in form does, so a taken
 * address is refused in the same words as a wrong password. Branching there is
 * how a sign-up form turns into a way of asking which addresses are registered.
 *
 * Every export of a "use server" module is a callable endpoint, and only async
 * functions may be exported from one. That is why the validation and the
 * provisioning are exported as functions rather than as a schema and a
 * constant, and why the helpers that take no arguments from a client stay
 * private to the module.
 */

import type { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "../../auth";
import { prisma } from "../db";
import { hashPassword, MAX_PASSWORD_BYTES } from "../password";
import { uniqueSlug } from "../slug";
import { isUniqueViolation } from "./form";

/** Short enough to type twice, long enough to be worth hashing. */
const MIN_PASSWORD_LENGTH = 10;

/** The longest address the standard allows. */
const MAX_EMAIL_LENGTH = 254;

const MAX_NAME_LENGTH = 80;

/**
 * The only thing either form says about a failed attempt. One sentence for a
 * wrong password, an unknown address and an address someone else already holds,
 * because telling those apart is exactly the question that must not be
 * answerable from outside.
 */
const REFUSED = "That email and password do not match an account.";

/** For the failures that are ours rather than the caller's. */
const UNAVAILABLE = "Something went wrong. Try again.";

const AFTER_SIGN_IN = "/";

const FIELDS = ["name", "email", "password"] as const;
type Field = (typeof FIELDS)[number];

export type FieldErrors = Partial<Record<Field, string>>;

/** What was typed. The password is left out: it goes back to nobody. */
export interface FormValues {
  name: string;
  email: string;
}

export interface AuthFormState {
  /** Shown above the form. Null when nothing has been refused yet. */
  error: string | null;
  fieldErrors: FieldErrors;
  /**
   * React empties an uncontrolled form as soon as the action it was submitted
   * to returns, so a refusal would hand back an empty page unless the inputs
   * read their values out of here.
   */
  values: FormValues;
}

export interface SignUpInput {
  name: string | null;
  email: string;
  password: string;
}

export type SignUpCheck =
  | { ok: true; value: SignUpInput }
  | { ok: false; fieldErrors: FieldErrors };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * The address is trimmed and stored as typed. Folding case here would only be
 * right if the sign-in side folded too, and it reads the column as stored, so a
 * lowercase write would lock out anyone who capitalises their own address.
 */
const signUpFields = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH, `Use ${MAX_NAME_LENGTH} characters or fewer.`)
    .transform((value) => value || null),
  email: z
    .string()
    .trim()
    .max(MAX_EMAIL_LENGTH, "That address is too long.")
    .pipe(z.email("Enter an email address.")),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    // Bytes, not characters: bcrypt stops at 72 of them and password.ts refuses
    // to store anything longer rather than truncate it silently.
    .refine(
      (value) => byteLength(value) <= MAX_PASSWORD_BYTES,
      `Use at most ${MAX_PASSWORD_BYTES} bytes.`,
    ),
});

/** Sign-in asks for no more than something to look up and something to check. */
const signInFields = z.object({
  email: z.string().trim().min(1).max(MAX_EMAIL_LENGTH),
  password: z.string().min(1),
});

function isField(value: unknown): value is Field {
  return typeof value === "string" && (FIELDS as readonly string[]).includes(value);
}

/**
 * The first complaint per field, in the order Zod found them. One message at a
 * time is what the form has room to show, and a field with two problems has the
 * second one waiting on the next attempt.
 */
function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (isField(field) && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/**
 * Check what the sign-up form sent.
 *
 * Separate from the action because these are the rules, and the rules are worth
 * testing without a database or a session behind them. Nothing here depends on
 * whether the address is already registered: that question is answered later,
 * and never out loud.
 */
export async function validateSignUp(input: unknown): Promise<SignUpCheck> {
  const parsed = signUpFields.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Write the User row, unless someone already holds the address.
 *
 * A taken address is not an error here. It is left to the sign-in that follows
 * to decide whether the person filling the form is the one who holds it, which
 * is the only way the answer can be the same either way.
 */
export async function registerUser(
  db: PrismaClient,
  input: SignUpInput,
): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  try {
    await db.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

/** For an address that is nothing but punctuation in front of the @. */
const DEFAULT_WORKSPACE_NAME = "Workspace";

/**
 * A workspace name out of an address: the local part, with the separators
 * people put in one read as spaces. The +tag is mail routing rather than part
 * of anyone's name, so it goes.
 */
function workspaceName(email: string): string {
  const at = email.lastIndexOf("@");
  const local = (at > 0 ? email.slice(0, at) : email).split("+")[0];
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_WORKSPACE_NAME;
  return words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export interface ProvisionedWorkspace {
  workspaceId: string;
  /** False when the user already had one, which is the second sign-in onwards. */
  created: boolean;
}

/**
 * Give a user somewhere to work the first time they arrive, and nothing at all
 * every time after.
 *
 * Any membership counts as having been here before. Counting workspaces the
 * user owns would make a second one appear the day someone hands their only
 * workspace to a colleague.
 *
 * The membership and the quota are nested in the one create, so the workspace
 * cannot exist for a moment with nobody able to reach it. Two sign-ins racing
 * each other could still both find no membership and both create a workspace:
 * nothing in the schema forbids a user holding two, so there is no constraint
 * to lean on, and the cost of losing that race is a spare workspace rather than
 * an account that does not work.
 */
export async function ensureWorkspaceForUser(
  db: PrismaClient,
  user: { id: string; email: string },
): Promise<ProvisionedWorkspace> {
  const existing = await db.membership.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return { workspaceId: existing.workspaceId, created: false };
  }

  const name = workspaceName(user.email);
  const slug = await uniqueSlug(name, async (candidate) => {
    const taken = await db.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return taken !== null;
  });

  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      memberships: { create: { userId: user.id, role: "OWNER" } },
      quota: { create: {} },
    },
    select: { id: true },
  });

  return { workspaceId: workspace.id, created: true };
}

/**
 * Read as posted, unlike field() next door. A password is trimmed by nobody:
 * not by this form, and not by the credentials provider that has to match it
 * later. Trimming here and not there locks out anyone whose password begins or
 * ends with a space. The name and the address are trimmed by the schema, where
 * it is safe.
 */
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

/** As typed, so the boxes come back reading what the person put in them. */
function posted(form: FormData): FormValues {
  return { name: text(form, "name"), email: text(form, "email") };
}

/**
 * Hand the credentials to Auth.js. True means they were turned away.
 *
 * `redirect: false` because the session cookie is not the last thing that has
 * to happen: the user may still need a workspace, and Auth.js redirecting from
 * inside would take the request away before that could be seen to.
 */
async function signInRefused(email: string, password: string): Promise<boolean> {
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    // Every refusal arrives as an AuthError. Anything else is ours and should
    // not be dressed up as a bad password.
    if (error instanceof AuthError) return true;
    throw error;
  }
  return false;
}

/**
 * The credentials were good, so the row is there to read. Done on every sign-in
 * rather than once at sign-up: a user who already has a membership costs one
 * indexed read, and nobody can end up signed in with nowhere to work.
 */
async function provisionFor(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (user) await ensureWorkspaceForUser(prisma, user);
}

export async function signUp(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const values = posted(form);
  const checked = await validateSignUp({
    name: values.name,
    email: values.email,
    password: text(form, "password"),
  });
  if (!checked.ok) {
    return { error: null, fieldErrors: checked.fieldErrors, values };
  }

  try {
    await registerUser(prisma, checked.value);
  } catch (error) {
    // Whatever the database said, it is not the caller's business and not their
    // fault. It is still ours to read, so it goes to the log rather than nowhere.
    console.error("sign-up could not write the user row", error);
    return { error: UNAVAILABLE, fieldErrors: {}, values };
  }

  if (await signInRefused(checked.value.email, checked.value.password)) {
    return { error: REFUSED, fieldErrors: {}, values };
  }

  await provisionFor(checked.value.email);
  redirect(AFTER_SIGN_IN);
}

export async function signInWithPassword(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const values = posted(form);
  const parsed = signInFields.safeParse({
    email: values.email,
    password: text(form, "password"),
  });
  // No account has an empty address or an empty password, so a form that fails
  // this is refused in the same sentence rather than a second, more specific
  // one that would have to be worded just as carefully.
  if (!parsed.success) {
    return { error: REFUSED, fieldErrors: {}, values };
  }

  if (await signInRefused(parsed.data.email, parsed.data.password)) {
    return { error: REFUSED, fieldErrors: {}, values };
  }

  await provisionFor(parsed.data.email);
  redirect(AFTER_SIGN_IN);
}

/**
 * Hands the browser to GitHub, so nothing written after this runs: the sign-in
 * finishes in the callback route rather than in an action. A first-time GitHub
 * user therefore never passes through provisionFor, which is why
 * ensureWorkspaceForUser is exported at all: it has to be callable from
 * wherever that user lands.
 */
export async function signInWithGitHub(): Promise<void> {
  await signIn("github", { redirectTo: AFTER_SIGN_IN });
}
