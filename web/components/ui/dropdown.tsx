"use client";

/** A menu that opens from a button: keyboard, typeahead and focus from Radix. */

import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cx } from "@/lib/cx";

export const Menu = Primitive.Root;
export const MenuTrigger = Primitive.Trigger;

export function MenuContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={6}
        className={cx(
          "ui-pop glass glass--card font-display text-foreground z-50 min-w-48 rounded-lg bg-surface p-1 text-sm",
          className,
        )}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

const ITEM =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-foreground outline-none select-none data-disabled:opacity-40 data-highlighted:bg-foreground/5";

export function MenuItem({
  className,
  tone,
  ...rest
}: ComponentProps<typeof Primitive.Item> & { tone?: "refused" }) {
  return (
    <Primitive.Item
      className={cx(ITEM, tone === "refused" && "text-refused", className)}
      {...rest}
    />
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <Primitive.Label className="px-2 pt-1.5 pb-1 text-[0.78rem] tracking-wider text-muted uppercase">
      {children}
    </Primitive.Label>
  );
}

export function MenuSeparator() {
  return <Primitive.Separator className="my-1 h-px bg-line" />;
}
