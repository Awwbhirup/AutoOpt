/**
 * Buttons, and links that look like them.
 *
 * One class builder for both, so a link styled as a button and a button next
 * to it cannot disagree about height. `pending` disables the control and keeps
 * its width, which is what stops a row of buttons shifting while one works.
 */

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "ui-focus relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-semibold tracking-wide whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-(--ui-primary) text-(--ui-primary-ink) shadow-[0_0_0_1px_var(--ui-primary),0_6px_20px_-8px_var(--ui-primary)] hover:brightness-110",
  secondary:
    "border-(--ui-border-strong) bg-(--ui-surface-solid) text-(--ui-ink) hover:border-(--ui-ink-3) hover:bg-(--ui-sunken)",
  ghost:
    "border-transparent bg-transparent text-(--ui-ink-2) hover:bg-(--ui-sunken) hover:text-(--ui-ink)",
  danger:
    "ui-tone-refused hover:bg-[color-mix(in_oklab,var(--ui-refused)_20%,transparent)]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-4 text-sm",
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cx(BASE, VARIANT[variant], SIZE[size], className);
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 animate-spin motion-reduce:animate-none"
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant,
  size,
  pending = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Busy: disabled, with a spinner laid over the label so the width holds. */
  pending?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass({ variant, size, className })}
      {...rest}
    >
      <span className={cx("inline-flex items-center gap-1.5", pending && "invisible")}>
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...rest}>
      {children}
    </Link>
  );
}
