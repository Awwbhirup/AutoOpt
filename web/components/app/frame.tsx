/**
 * The frame every app page sits in: the app faces and tokens, the backdrop,
 * the glass filters, and the toast viewport. Shared by the workspace pages and the sign-in pages
 * so both read as the same application.
 */

import "@/components/ui/theme.css";

import type { ReactNode } from "react";

import { GlassFilters } from "@/components/landing/glass";
import { ToastProvider } from "@/components/ui/toast";
import { cx } from "@/lib/cx";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ui-root flex min-h-dvh w-full min-w-0 flex-1 flex-col bg-background font-display text-foreground">
      <GlassFilters />
      <div aria-hidden className="ui-backdrop" />
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}

/** The width and padding of a page's main column. */
export function PageMain({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "wide" | "narrow";
}) {
  return (
    <main
      className={cx(
        "mx-auto w-full min-w-0 flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-10",
        width === "wide" ? "max-w-6xl" : "max-w-4xl",
      )}
    >
      {children}
    </main>
  );
}
