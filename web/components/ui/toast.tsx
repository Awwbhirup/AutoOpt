"use client";

/**
 * Toasts for things that finish somewhere other than where they were started:
 * a run that saved, a key that was revoked, a request that failed.
 *
 * useToast() is safe to call outside the provider. It does nothing there, so a
 * component can be reused on a page that has no viewport without guarding.
 */

import { Toast as Primitive } from "radix-ui";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cx } from "@/lib/cx";
import {
  closeToast,
  pushToast,
  removeToast,
  toastDefaults,
  type Toast,
  type ToastInput,
  type ToastTone,
} from "@/lib/toasts";

type Notify = (input: ToastInput) => void;

const ToastContext = createContext<Notify>(() => {});

export function useToast(): Notify {
  return useContext(ToastContext);
}

const MARK: Record<ToastTone, string> = {
  neutral: "bg-muted",
  kept: "bg-accent",
  refused: "bg-refused",
  info: "bg-ramp-1",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const next = useRef(1);

  const notify = useCallback<Notify>((input) => {
    const id = next.current;
    next.current += 1;
    setQueue((current) => pushToast(current, toastDefaults(input, id)));
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      <Primitive.Provider swipeDirection="right" label="Notification">
        {children}
        {queue.map((toast) => (
          <Primitive.Root
            key={toast.id}
            open={toast.open}
            duration={toast.duration}
            type={toast.tone === "refused" ? "foreground" : "background"}
            onOpenChange={(open) => {
              if (!open) setQueue((current) => closeToast(current, toast.id));
            }}
            onAnimationEnd={() => {
              if (!toast.open) setQueue((current) => removeToast(current, toast.id));
            }}
            className="ui-toast glass glass--card font-display text-foreground relative flex gap-3 overflow-hidden rounded-lg bg-surface py-3 pr-9 pl-4"
          >
            <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1", MARK[toast.tone])} />
            <div className="min-w-0">
              <Primitive.Title className="text-sm font-semibold">{toast.title}</Primitive.Title>
              {toast.description === null ? null : (
                <Primitive.Description className="mt-0.5 text-xs leading-relaxed text-foreground/75">
                  {toast.description}
                </Primitive.Description>
              )}
            </div>
            <Primitive.Close
              aria-label="Dismiss"
              className="ui-focus absolute top-2.5 right-2.5 grid size-6 place-items-center rounded text-muted hover:bg-foreground/5 hover:text-foreground"
            >
              <svg aria-hidden viewBox="0 0 12 12" className="size-2.5">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Primitive.Close>
          </Primitive.Root>
        ))}
        <Primitive.Viewport className="fixed right-0 bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </Primitive.Provider>
    </ToastContext.Provider>
  );
}
