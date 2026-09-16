/**
 * The bar every signed-in page sits under.
 *
 * The role is shown rather than implied. A VIEWER who cannot find the button to
 * add a program should be able to see why without reading the documentation.
 */

import Link from "next/link";

import type { Role } from "@/lib/authorize";

import { WorkspaceNav, type NavLink } from "./nav";
import { UserMenu } from "./user-menu";

export function WorkspaceHeader({
  workspace,
  role,
  user,
}: {
  workspace: { name: string; slug: string };
  role: Role;
  user: { name: string | null; email: string | null };
}) {
  const base = `/w/${workspace.slug}`;
  const links: NavLink[] = [
    // Exact, because every other link below starts with this one's href.
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/projects`, label: "Projects" },
    { href: `${base}/runs`, label: "Runs" },
    { href: "/docs", label: "Docs" },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2">
        <Link
          href={base}
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          {workspace.name}
        </Link>
        <span
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          title="Your role in this workspace"
        >
          {role.toLowerCase()}
        </span>

        <WorkspaceNav links={links} />

        <div className="ml-auto">
          <UserMenu name={user.name} email={user.email} />
        </div>
      </div>
    </header>
  );
}
