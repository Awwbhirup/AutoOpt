"use client";

/**
 * The links across the top, with the current one marked.
 *
 * The only part of the header that needs the browser: which link is current
 * depends on the path, and the path is not a prop the layout can be given.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/lib/cx";

export interface NavLink {
  href: string;
  label: string;
  /** For the dashboard, whose href is a prefix of every other link's. */
  exact?: boolean;
}

export function WorkspaceNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
      {links.map((link) => {
        const current = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cx(
              "ui-focus relative shrink-0 rounded-md px-2.5 py-1.5 font-medium transition-colors",
              current
                ? "bg-foreground/5 text-foreground"
                : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {link.label}
            {current ? (
              <span
                aria-hidden
                className="absolute inset-x-2.5 -bottom-px h-px bg-linear-to-r from-ramp-1 to-ramp-4"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
