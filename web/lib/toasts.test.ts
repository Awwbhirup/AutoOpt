import { describe, expect, it } from "vitest";

import { closeToast, MAX_TOASTS, pushToast, removeToast, toastDefaults } from "./toasts";

describe("toast queue", () => {
  it("fills in tone and duration, and gives errors longer on screen", () => {
    const plain = toastDefaults({ title: "Saved" }, 1);
    const error = toastDefaults({ title: "Failed", tone: "refused" }, 2);

    expect(plain.tone).toBe("neutral");
    expect(plain.description).toBeNull();
    expect(error.duration).toBeGreaterThan(plain.duration);
    expect(toastDefaults({ title: "x", duration: 100 }, 3).duration).toBe(100);
  });

  it("keeps the newest last and drops the oldest past the cap", () => {
    let queue = [] as ReturnType<typeof pushToast>;
    for (let id = 1; id <= MAX_TOASTS + 2; id += 1) {
      queue = pushToast(queue, toastDefaults({ title: `t${id}` }, id));
    }

    expect(queue).toHaveLength(MAX_TOASTS);
    expect(queue.at(-1)?.id).toBe(MAX_TOASTS + 2);
    expect(queue[0].id).toBe(3);
  });

  it("replaces a repeat of the same message instead of stacking it", () => {
    let queue = pushToast([], toastDefaults({ title: "Run started" }, 1));
    queue = pushToast(queue, toastDefaults({ title: "Other" }, 2));
    queue = pushToast(queue, toastDefaults({ title: "Run started" }, 3));

    expect(queue.map((entry) => entry.id)).toEqual([2, 3]);
  });

  it("marks a toast closed before removing it", () => {
    const queue = pushToast([], toastDefaults({ title: "a" }, 1));
    const closed = closeToast(queue, 1);

    expect(closed[0].open).toBe(false);
    expect(removeToast(closed, 1)).toEqual([]);
  });
});
