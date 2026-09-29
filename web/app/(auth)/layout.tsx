import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/app/brand-mark";
import { AppFrame } from "@/components/app/frame";

// A route group, so /signin and /signup keep their paths and only share this
// shell. Both pages are client components: the forms report what went wrong
// without losing what was typed, which needs a hook, and a hook needs a client.
// A client component cannot export metadata, so the title stays the root one.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
        <Link
          href="/"
          className="ui-focus flex items-center gap-2 self-start rounded-md text-sm font-bold tracking-tight text-foreground/75 transition-colors hover:text-foreground"
        >
          <BrandMark />
          AutoOpt
        </Link>

        <div className="glass glass--card mt-4 rounded-2xl p-6 sm:p-7">{children}</div>
      </main>
    </AppFrame>
  );
}
