/**
 * The bar over the pages anyone can open: the playground and the docs. No
 * session lookup, so those pages stay static; "Open app" goes to /w, which
 * sends a signed-out visitor to sign in.
 */

import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";

import { BrandMark } from "./brand-mark";
import { PublicNav } from "./public-nav";

export function PublicHeader() {
  return (
    <div className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <header className="glass glass--card mx-auto flex w-full max-w-6xl items-center gap-2 rounded-xl px-2 py-1.5 sm:px-3">
        <Link href="/" aria-label="AutoOpt home" className="ui-focus flex items-center gap-2 rounded-md px-1.5 py-1">
          <BrandMark />
          <span className="text-sm font-bold tracking-tight">AutoOpt</span>
        </Link>
        <PublicNav />
        <ButtonLink href="/w" size="sm" variant="primary" className="ml-auto">
          Open app
        </ButtonLink>
      </header>
    </div>
  );
}
