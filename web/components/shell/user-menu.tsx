"use client";

/**
 * Who the application thinks you are, and the way out.
 *
 * Signing out stays a form post inside the menu: the item is the form's submit
 * button, so Enter on it and a click do the same thing.
 */

import Link from "next/link";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/dropdown";
import { signOutAction } from "@/lib/actions/session";

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "?").trim();
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account"
        className="ui-focus font-terminal tabular-nums grid size-8 place-items-center rounded-full border border-foreground/15 bg-foreground/5 text-[0.75rem] font-semibold text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        {initials(name, email)}
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Signed in as</MenuLabel>
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-semibold">{name ?? "No name set"}</p>
          {email ? <p className="font-terminal tabular-nums truncate text-xs text-muted">{email}</p> : null}
        </div>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/docs">Language docs</Link>
        </MenuItem>
        <MenuSeparator />
        <form action={signOutAction}>
          <MenuItem asChild tone="refused">
            <button type="submit" className="w-full text-left">
              Sign out
            </button>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  );
}
