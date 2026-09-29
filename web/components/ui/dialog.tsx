"use client";

/**
 * A modal over the page. Radix handles focus trapping, Escape, scroll lock and
 * returning focus to the trigger; this file only gives it a look.
 */

import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="ui-fade fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
      <Primitive.Content
        className={cx(
          "ui-pop ui-glass ui-root fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-(--ui-surface-solid) p-5 focus:outline-none",
          className,
        )}
      >
        <Primitive.Title className="text-base font-semibold tracking-tight">
          {title}
        </Primitive.Title>
        {description ? (
          <Primitive.Description className="mt-1 text-sm leading-relaxed text-(--ui-ink-2)">
            {description}
          </Primitive.Description>
        ) : (
          // Radix warns without one; an empty description says there is none.
          <Primitive.Description className="sr-only">{title}</Primitive.Description>
        )}
        <div className="mt-4">{children}</div>
        <Primitive.Close
          aria-label="Close"
          className="ui-focus absolute top-3 right-3 grid size-7 place-items-center rounded-md text-(--ui-ink-3) transition-colors hover:bg-(--ui-sunken) hover:text-(--ui-ink)"
        >
          <svg aria-hidden viewBox="0 0 12 12" className="size-3">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
