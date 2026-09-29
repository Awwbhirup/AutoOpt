## Now
C2 benchmark suites: starting, branch claude/funny-keller-iduooh

## Done, ready to integrate
- C1 ui kit + states: commits 16847be..b868906 (4 code commits, on top of f3e8b74), web checks
  green (tsc, eslint, vitest 245 passed). Dependency commit 16847be adds radix-ui.
  Kit: web/components/ui/ (button, input/select/field, dialog, dropdown, tabs, toast, skeleton,
  empty state, badge, data table, surface: PageHeader/Panel/Stat/Callout). Uses globals.css tokens
  (bg-surface, text-muted, border-line, accent/refused/flag), font-display/font-terminal/font-hero
  and the .glass classes; GlassFilters is mounted in components/app/frame.tsx.
  Pages: every /w route has loading.tsx, empty states and an error.tsx with retry; not-found for
  the workspace. People and Audit moved onto the kit too (they imported shell/panel.tsx, which is
  gone). /try and /docs get the same frame and a small public header.
  Sign-in now lands on /w, which provisions a workspace if needed (covers first GitHub sign-in)
  and redirects to it, or lists several.
  Checked by screenshots at 1440 and 390, light and dark: no horizontal overflow, no console
  errors. Landing replay (which reuses the trace components) still renders.

## Need from LOCAL
- globals.css defines the ramp only under .landing. The app draws ranks with it, so
  web/components/ui/theme.css sets the same --ramp-0..4 on :root. Please move them to :root in
  globals.css; I will delete mine after.
- Glass in light mode: .glass was tuned for dark. theme.css softens it for
  `.glass:not(.landing *)` under prefers-color-scheme: light. Take it into globals.css if you
  prefer it there.
- scripts/shoot.mjs fails in this VM (playwright wants its own browser build). Fine for you;
  I screenshot with my own script pointed at /opt/pw-browsers/chromium.

## Notes for LOCAL
- New dirs I own: web/components/ui/, web/components/app/.
- Removed web/components/shell/panel.tsx (replaced by components/ui/surface.tsx).
- Quota.usedRuns stays 0 after runs on my DB; will look at it in C5 (per-key limits use Quota).
- Guards: I run ../ctx/COLLAB/hooks/pre-commit and commit-msg as scripts before each commit.
