/**
 * Form controls: text inputs, a textarea, a native select, and the label and
 * message around them.
 *
 * The select is the browser's own. It works inside a server action form with
 * no JavaScript, reads correctly to a screen reader, and on a phone opens the
 * system picker, which a custom listbox would have to imitate.
 */

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "@/lib/cx";

const FIELD =
  "ui-focus w-full rounded-md border border-(--ui-border-strong) bg-(--ui-surface-solid) text-sm text-(--ui-ink) transition-colors placeholder:text-(--ui-ink-3) hover:border-(--ui-ink-3) disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-(--ui-refused)";

export function fieldClass(className?: string): string {
  return cx(FIELD, className);
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD, "h-9 px-3", className)} {...rest} />;
}

export function Textarea({
  className,
  mono = false,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      className={cx(FIELD, "px-3 py-2 leading-relaxed", mono && "ui-mono text-xs", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative inline-flex", className)}>
      <select
        className={cx(FIELD, "h-9 appearance-none py-0 pr-8 pl-3")}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 text-(--ui-ink-3)"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

/** A label above a control, with a hint or an error under it. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium tracking-wide text-(--ui-ink-2)"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-(--ui-refused-ink)">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-(--ui-ink-3)">{hint}</p>
      ) : null}
    </div>
  );
}
