"use server";

/**
 * Signing out, as an action a client menu can post to. A form rather than a
 * link, because it changes something and a prefetch must not be able to fire it.
 */

import { signOut } from "../../auth";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
