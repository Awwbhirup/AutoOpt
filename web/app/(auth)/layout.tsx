import Link from "next/link";
import type { ReactNode } from "react";

// A route group, so /signin and /signup keep their paths and only share this
// shell. Both pages are client components: the forms report what went wrong
// without losing what was typed, which needs a hook, and a hook needs a client.
// A client component cannot export metadata, so the title stays the root one.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Link
        href="/"
        className="text-sm font-medium tracking-tight text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
      >
        AutoOpt
      </Link>

      <div className="mt-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        {children}
      </div>
    </main>
  );
}
