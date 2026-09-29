/**
 * The queue behind the toast viewport, kept apart from React so the rules are
 * testable: newest last, a cap on how many stay on screen, and a repeat of the
 * same message replacing the old one rather than stacking a copy under it.
 */

export type ToastTone = "neutral" | "kept" | "refused" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds on screen. Errors default longer: they need reading. */
  duration?: number;
}

export interface Toast extends Required<Omit<ToastInput, "description">> {
  id: number;
  description: string | null;
  open: boolean;
}

/** More than this and the oldest go, whether or not their timer has run. */
export const MAX_TOASTS = 4;

export function toastDefaults(input: ToastInput, id: number): Toast {
  const tone = input.tone ?? "neutral";
  return {
    id,
    title: input.title,
    description: input.description ?? null,
    tone,
    duration: input.duration ?? (tone === "refused" ? 8000 : 4500),
    open: true,
  };
}

export function pushToast(queue: readonly Toast[], toast: Toast): Toast[] {
  const rest = queue.filter(
    (entry) => !(entry.title === toast.title && entry.description === toast.description),
  );
  return [...rest, toast].slice(-MAX_TOASTS);
}

/** Closing is two steps: marked closed so the exit can play, then removed. */
export function closeToast(queue: readonly Toast[], id: number): Toast[] {
  return queue.map((entry) => (entry.id === id ? { ...entry, open: false } : entry));
}

export function removeToast(queue: readonly Toast[], id: number): Toast[] {
  return queue.filter((entry) => entry.id !== id);
}
