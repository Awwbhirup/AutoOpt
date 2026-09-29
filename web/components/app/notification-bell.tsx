"use client";

/**
 * The bell in the header. The unread count arrives over server-sent events;
 * the list is fetched when the menu opens. A notification newer than the one
 * seen when the page loaded also shows as a toast, so a suite finishing while
 * you read something else is not missed.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Menu, MenuContent, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/dropdown";
import { useToast } from "@/components/ui/toast";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { cx } from "@/lib/cx";
import type { NotificationEntry } from "@/lib/notifications";

interface Snapshot {
  unread: number;
  newest: { id: string; title: string; body: string | null } | null;
}

const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function NotificationBell() {
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationEntry[] | null>(null);
  const seenNewest = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    source.addEventListener("notifications", (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as Snapshot;
      setUnread(snapshot.unread);
      const newest = snapshot.newest?.id ?? null;
      // The first snapshot is the baseline; only later arrivals are news.
      if (seenNewest.current !== undefined && newest !== null && newest !== seenNewest.current && snapshot.newest) {
        toast({ title: snapshot.newest.title, description: snapshot.newest.body ?? undefined, tone: "info" });
        setItems(null);
      }
      seenNewest.current = newest;
    });
    return () => source.close();
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) return;
      const body = (await response.json()) as { items: NotificationEntry[]; unread: number };
      setItems(body.items);
      setUnread(body.unread);
    } catch {
      // The count stays as it was; the menu says it could not load.
      setItems([]);
    }
  }, []);

  const readAll = async () => {
    setUnread(0);
    setItems((current) => current?.map((item) => ({ ...item, read: true })) ?? current);
    await markNotificationsRead("all");
  };

  const readOne = (id: string) => {
    setItems((current) => current?.map((item) => (item.id === id ? { ...item, read: true } : item)) ?? current);
    setUnread((count) => Math.max(count - 1, 0));
    void markNotificationsRead([id]);
  };

  return (
    <Menu onOpenChange={(open) => (open ? void load() : null)}>
      <MenuTrigger
        aria-label={unread === 0 ? "Notifications" : `Notifications, ${unread} unread`}
        className="ui-focus relative grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-4">
          <path
            d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11h11L12 8.5V6a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 font-terminal text-[0.65rem] leading-4 text-background tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </MenuTrigger>
      <MenuContent className="w-[min(22rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between pr-1">
          <MenuLabel>Notifications</MenuLabel>
          {unread > 0 ? (
            <button type="button" onClick={readAll} className="ui-focus rounded px-2 py-1 text-xs text-muted hover:text-foreground">
              Mark all read
            </button>
          ) : null}
        </div>
        <MenuSeparator />
        {items === null ? (
          <p className="px-3 py-4 text-sm text-muted">Loading...</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            Nothing yet. You will hear here when a suite you started finishes, or when someone adds you
            to a workspace.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto overscroll-contain" data-lenis-prevent>
            {items.map((item) => {
              const body = (
                <>
                  <span
                    aria-hidden
                    className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-accent")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm", item.read ? "text-foreground/75" : "font-semibold")}>{item.title}</span>
                    {item.body ? <span className="block text-xs text-muted">{item.body}</span> : null}
                    <span className="block font-terminal text-xs text-muted">{WHEN.format(new Date(item.createdAt))}</span>
                  </span>
                </>
              );
              const look = "flex gap-2.5 rounded-md px-2.5 py-2 hover:bg-foreground/5";
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href} onClick={() => readOne(item.id)} className={cx("ui-focus", look)}>
                      {body}
                    </Link>
                  ) : (
                    <div className={look}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </MenuContent>
    </Menu>
  );
}
