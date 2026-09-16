/**
 * Who the application thinks you are, and the way out.
 *
 * Signing out is a form and not a link, because it changes something. A GET
 * that ends a session is one a prefetch can fire.
 */

import { signOut } from "@/auth";

export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="max-w-[16rem] truncate text-sm text-zinc-600 dark:text-zinc-400"
        title={email ?? undefined}
      >
        {name ?? email ?? "Signed in"}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
