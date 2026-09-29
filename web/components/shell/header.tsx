/**
 * The bar every signed-in page sits under: a floating pane with the brand, the
 * workspace (which switches), the sections, and the account menu.
 *
 * The role is shown rather than implied. A VIEWER who cannot find the button to
 * add a program should be able to see why without reading the documentation.
 */

import Link from "next/link";

import { BrandMark } from "@/components/app/brand-mark";
import { CommandPalette } from "@/components/app/command-palette";
import type { Role } from "@/lib/authorize";

import { WorkspaceNav, type NavLink } from "./nav";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher, type SwitcherEntry } from "./workspace-switcher";

export function WorkspaceHeader({
  workspace,
  role,
  user,
  mayAudit,
  workspaces,
}: {
  workspace: { name: string; slug: string };
  role: Role;
  user: { name: string | null; email: string | null };
  /** Decided by authorize() in the layout, not by comparing roles here. */
  mayAudit: boolean;
  workspaces: SwitcherEntry[];
}) {
  const base = `/w/${workspace.slug}`;
  const links: NavLink[] = [
    // Exact, because every other link below starts with this one's href.
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/projects`, label: "Projects" },
    { href: `${base}/runs`, label: "Runs" },
    { href: `${base}/suites`, label: "Suites" },
    { href: `${base}/analytics`, label: "Analytics" },
    { href: `${base}/settings`, label: "People" },
    // The page itself returns a 404 to anyone else, so leaving this out is
    // about not offering a dead end rather than about keeping them out.
    ...(mayAudit ? [{ href: `${base}/audit`, label: "Audit" }] : []),
  ];

  return (
    <div className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <header className="glass glass--card mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 sm:flex-nowrap sm:px-3">
        <Link
          href="/"
          aria-label="AutoOpt home"
          className="ui-focus flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1"
        >
          <BrandMark />
          <span className="hidden text-sm font-bold tracking-tight md:inline">AutoOpt</span>
        </Link>
        <span aria-hidden className="text-muted/60">
          /
        </span>
        <div className="min-w-0 flex-1 sm:flex-none">
          <WorkspaceSwitcher current={workspace} role={role} workspaces={workspaces} />
        </div>

        <div className="order-last w-full sm:order-none sm:ml-2 sm:w-auto sm:flex-1">
          <WorkspaceNav links={links} />
        </div>

        <div className="flex items-center gap-1.5">
          <CommandPalette slug={workspace.slug} workspaces={workspaces} />
          <Link
            href="/docs"
            className="ui-focus hidden rounded-md px-2 py-1 text-sm text-foreground/75 transition-colors hover:text-foreground sm:inline"
          >
            Docs
          </Link>
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
    </div>
  );
}
