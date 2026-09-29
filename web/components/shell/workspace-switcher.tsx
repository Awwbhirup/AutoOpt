"use client";

/**
 * The current workspace's name, which opens the list of the others. With one
 * workspace the menu still opens and says so, rather than the name being a
 * control that sometimes does nothing.
 */

import Link from "next/link";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@/components/ui/dropdown";

export interface SwitcherEntry {
  slug: string;
  name: string;
  role: string;
}

export function WorkspaceSwitcher({
  current,
  role,
  workspaces,
}: {
  current: { slug: string; name: string };
  role: string;
  workspaces: SwitcherEntry[];
}) {
  return (
    <Menu>
      <MenuTrigger className="ui-focus group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-foreground/5">
        <span className="truncate text-sm font-semibold">{current.name}</span>
        <span
          className="font-terminal tabular-nums rounded border border-foreground/15 px-1 py-px text-[0.72rem] tracking-wide text-muted uppercase"
          title="Your role in this workspace"
        >
          {role.toLowerCase()}
        </span>
        <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-muted">
          <path d="M3.5 5 6 2.5 8.5 5M3.5 7 6 9.5 8.5 7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </MenuTrigger>
      <MenuContent align="start" className="min-w-60">
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces.map((entry) => (
          <MenuItem key={entry.slug} asChild>
            <Link href={`/w/${entry.slug}`} aria-current={entry.slug === current.slug ? "page" : undefined}>
              <span
                aria-hidden
                className={
                  entry.slug === current.slug
                    ? "size-1.5 rounded-full bg-accent"
                    : "size-1.5 rounded-full bg-transparent"
                }
              />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="font-terminal tabular-nums text-[0.72rem] text-muted uppercase">
                {entry.role.toLowerCase()}
              </span>
            </Link>
          </MenuItem>
        ))}
        {workspaces.length <= 1 ? (
          <p className="px-2 py-1.5 text-xs text-muted">
            This is the only workspace you belong to.
          </p>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
