/**
 * What the forms in this directory post, and what the actions answer with.
 *
 * useActionState hands an action the previous state and a FormData and nothing
 * else, so a refusal is a value the action returns rather than something it
 * throws. These live outside the action modules because a "use server" module
 * may export nothing but async functions.
 */

export interface ActionState {
  /** Null when nothing has gone wrong, which includes before anything is tried. */
  error: string | null;
  /** What was just created, so the form can clear itself and link to it. */
  createdId: string | null;
}

export const IDLE: ActionState = { error: null, createdId: null };

export function failed(error: string): ActionState {
  return { error, createdId: null };
}

export function created(id: string): ActionState {
  return { error: null, createdId: id };
}

/** A trimmed field. FormData yields a File for a file input, which is not text. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The unique violation, recognised by its code rather than by importing
 * Prisma's error class. That import drags the client runtime into every module
 * that wants to tell a name already taken from a database that fell over.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Said to a caller who named a workspace that is not theirs and to one who
 * named a workspace that does not exist, because those have to be the same
 * answer. See lib/workspace.ts.
 */
export const NO_WORKSPACE = "That workspace does not exist.";

export const SIGNED_OUT = "Your session has ended. Sign in and try again.";
