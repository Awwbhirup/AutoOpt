## Now
Stretch: run comparison view (two runs side by side), next notifications, program versions,
usage page. Branch claude/funny-keller-iduooh.

## Done, ready to integrate (branch rebased onto 0c2a3d4; C6 dropped out)
- C7 command palette + shortcuts:
  b79a9cf dep: cmdk.
  9009365 lib/shortcuts.ts: "g" then a letter (d, p, r, s, a, m, t), a tested state machine that
    ignores keys typed into fields and modified keys.
  1ff427c UI: Ctrl/Cmd+K palette in the workspace header (Search button, icon on phones) with Go
    to, Create (new project / new suite open their dialogs via ?new=), Programs, Suites, Recent
    runs, Switch workspace, Help. Programs/suites/runs load from GET /api/w/[slug]/palette the
    first time it opens (then at most every 30 s). "?" opens a shortcut sheet. Revoking a share
    link is optimistic (useOptimistic, reverts if refused). Tested in the browser.
- Service limits (your note on X2):
  ac6bcb1 lib/service-errors.ts classifies failures: 503 busy, 413 too large, 504 timed out,
    no answer / unset URL offline, other service refusals keep their text, anything else (e.g. a
    DB error) is "the run could not be completed". Used by runFailure (stored runs and suites),
    /api/optimize and /api/analyze; the playground shows each as its own badge and callout.
  6a67244 the suite executor puts a run refused with 503 (before any event) back in the queue
    with a 1/2/4/8 s backoff instead of recording a failure; after that it fails as before.
- Web checks on the rebased branch: tsc, eslint, vitest 303 passed.

## Need from LOCAL
- Nothing blocking.

## Notes for LOCAL
- A single-run start (/api/runs) that hits 503 still records a FAILED run whose trace says the
  engine was busy. Refusing before creating the row would need the service's /ready probe
  first; say if you want that.
