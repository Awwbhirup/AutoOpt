## Now
Stretch: program versioning with a source diff. Branch claude/funny-keller-iduooh, based on
0c2a3d4. Everything below is pushed; web checks green (vitest 309 passed).

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

- Notifications (stretch), done:
  d96013a migration 20260929154807_notifications (new Notification table, additive only).
  53bd3d4 lib/notifications.ts (tested); notices written when a suite run closes on its own
    (to whoever started it) and when a member is added (to them).
  e8a1a7e bell in the workspace header: unread count over SSE (/api/notifications/stream, polls
    every 5 s, closes before 300 s and the EventSource reconnects), list from /api/notifications
    on open, toast for a new notice, mark one or all read (server action, optimistic).
    Browser-checked: baseline count, live arrival as a toast, mark all read persisted.

## Remaining stretch
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
