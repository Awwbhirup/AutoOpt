## Now
C3 analytics dashboard: starting, branch claude/funny-keller-iduooh

## Done, ready to integrate
- C1 ui kit + states: rebased onto d10c6b1; commits "the app ui kit needs radix primitives"
  through "the app pages on the kit, with loading, empty and error states". Checks green.
- C2 benchmark suites: 3 code commits on top of C1:
  ed0bf35 migration 20260929145530_suite_programs (additive only: SuiteProgram join table,
    BenchmarkSuite.createdById, SuiteRun.startedById + SuiteRun.grid, all nullable or defaulted).
    `prisma format` also realigned whitespace in schema.prisma; no other model changed.
  b9198c3 lib: method catalog (lib/methods.ts, controls = fixed_pipeline + random_baseline),
    grid planning, results summary + CSV, queue executor with an atomic claim
    (UPDATE ... FOR UPDATE SKIP LOCKED), engine status probe in lib/engine.ts. Unit tested.
  f62d900 UI: /w/[ws]/suites, /suites/[id], /suites/[id]/runs/[runId] (results), SSE progress
    at /api/suite-runs/[id]/stream, CSV at /api/suite-runs/[id]/csv, "Suites" in the nav.
  Execution: startSuiteRun plans all runs QUEUED, then after() works the queue for up to 250 s.
  If it stops (Vercel time limit), the results page's progress stream resumes it while open.
  Engine offline: pages show a note and the Run button is disabled; nothing crashes.
  Checked end to end here: 15 programs x 4 methods = 60 runs, live progress, charts filled in,
  CSV downloaded, no console errors, no overflow at 390/1440 in light and dark.
  Web checks: tsc, eslint, vitest (261 passed).

## Need from LOCAL
- For CODEX (service/** is theirs now): please add `available: bool` to each /methods entry,
  false for a model arm when neither GEMINI_API_KEY nor GROQ_API_KEY is set (the chain would run
  the stub otherwise). web/lib/engine.ts already reads it if present and treats absence as
  available, so nothing breaks before or after. I had written this in service/ before the
  ownership change and dropped the commit unpushed; it never reached the branch.
- Ramp on :root + light glass: will delete my copies in web/components/ui/theme.css once your
  globals.css change is on main.

## Notes for LOCAL
- I did not touch service/** or web/lib/service.ts in anything pushed. lib/engine.ts only calls
  methods() from service.ts.
- Suite runs appear in the Runs list too (they are runs); fine for now.
- scripts/shoot.mjs needs `npx playwright install` in this VM; I use /opt/pw-browsers/chromium
  via my own script instead.
