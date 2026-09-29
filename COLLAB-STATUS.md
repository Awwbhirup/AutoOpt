## Now
HANDOFF: CLOUD is stopping (session limit). Everything is committed and pushed on
claude/funny-keller-iduooh, based on origin/main 0c2a3d4. Web checks green: tsc, eslint,
vitest 309 passed. LOCAL (or whoever continues) can pick up from the list below.

## Done, ready to integrate (in branch order, on top of 0c2a3d4)
- C7 command palette + shortcuts: b79a9cf (dep: cmdk), 9009365 (lib/shortcuts.ts, tested),
  1ff427c (Ctrl/Cmd+K palette in the header, GET /api/w/[slug]/palette, "?" shortcut sheet,
  ?new=project / ?new=suite open the create dialogs, optimistic share revoke).
- Service limits: ac6bcb1 (lib/service-errors.ts: 503 busy, 413 too large, 504 timed out, offline,
  used by runFailure, /api/optimize, /api/analyze and the playground), 6a67244 (suite executor
  requeues a run refused with 503 before any event, backoff 1/2/4/8 s, then fails as before).
- Stretch, run comparison: cf48b0d (lib/compare.ts LCS alignment of kept rewrites + kind
  counts, tested; lib/replay.ts shared by run-report), c4fdbf4 (/w/[ws]/runs/compare?a=&b=,
  "Compare" button on the run page; GET form pickers, side by side facts, aligned rewrites,
  counts per kind, diff of the two final listings). Browser-checked light/dark, 390/1440.

## Partly done: notifications (stretch) - backend committed, UI not built
- d96013a migration 20260929154807_notifications: new Notification table (userId, workspaceId?,
  kind, title, body?, href?, readAt?, createdAt; index userId+createdAt; cascades). Additive only.
- 53bd3d4 lib/notifications.ts (text builders, tested; notify() best-effort; listNotifications,
  unreadCount). Producers wired: lib/suites/store.ts refresh() notifies the starter when a suite
  run closes on its own (a hand-stopped run does not notify); lib/actions/members.ts
  addWorkspaceMember() notifies the added user.
- To finish (my plan, not started):
  1. lib/actions/notifications.ts: server action markNotificationsRead(ids | "all") for the
     session user only.
  2. GET /api/notifications -> { unread, items } via listNotifications/unreadCount.
  3. GET /api/notifications/stream: SSE like app/api/suite-runs/[id]/stream/route.ts, poll every
     5 s, send { unread, newestId } when it changes, close after ~280 s (EventSource reconnects).
  4. components/app/notification-bell.tsx in components/shell/header.tsx next to the palette:
     bell button with unread count, Radix dropdown (components/ui/dropdown.tsx) listing items
     (unread dot, title, body, time, link via href), "Mark all read"; toast (useToast) when a
     newer id arrives after the first snapshot.
  5. Browser check at 390/1440 light/dark, then commit.
  If you would rather not ship it half done, the two commits are safe to integrate alone: the
  table just fills up with unread rows until the bell exists.

## Remaining stretch after that
- Program versioning with a source diff (lib/diff.ts + components/app/playground/diff-view.tsx
  already exist and can be reused).
- Workspace usage page from Quota. Note: nothing increments Quota.usedRuns yet (startRun and
  the suite planner do not touch it); CODEX's X3 was going to use Quota for key rate limits, so
  coordinate who owns incrementing it.

## Need from LOCAL
- Nothing blocking.

## Notes for LOCAL
- A single run started from a program page that hits 503 still records a FAILED run whose trace
  says the engine was busy. Refusing before creating the row would need a /ready probe first.
- Local dev tips from this VM: after pulling a schema change run `npx prisma generate` and
  restart `next dev` (it caches the old client); if Turbopack reports a stale package.json
  error after a rebase, delete web/.next.
