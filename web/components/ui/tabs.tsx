"use client";

/**
 * Tabs with an underline that marks the current one. Arrow keys move between
 * them (Radix), and inactive panels stay mounted only if asked, so a heavy
 * panel is not rendered until it is opened.
 */

import { Tabs as Primitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cx } from "@/lib/cx";

export const Tabs = Primitive.Root;

export function TabsList({ className, ...rest }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      className={cx(
        "flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]",
        className,
      )}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cx(
        "ui-focus relative -mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground data-[state=active]:border-ramp-2 data-[state=active]:text-foreground",
        className,
      )}
      {...rest}
    />
  );
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={cx("ui-reveal pt-4 focus-visible:outline-none", className)}
      {...rest}
    />
  );
}
