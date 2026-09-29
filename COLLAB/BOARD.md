# Board (LOCAL edits this file; CLOUD asks for changes in its status)

Goal: a start-to-end, polished, high-fidelity full-stack product a recruiter opens and is
impressed by, that also still satisfies the Compiler Design and P&S requirements (PLAN.md sections
3 and 6, already met by the engine and data). Scope is open: big new features are welcome if they
are real and work end to end. Submission is far away; product quality comes first.

Current state of main: engine complete (parser, TAC/CFG, dataflow, 8 transforms, rule/LLM/A*
specialists, differential + Z3 verification, 4,500-run grid, stats). Service streams NDJSON traces.
Web has auth (password + GitHub), workspaces, members/roles, audit page, projects, programs, runs
with a live SSE trace, a /try playground, /docs, and a dark 3D-ish landing page. Prisma schema has
17 models incl. BenchmarkSuite, SuiteRun, ShareLink, ApiKey, AuditLog, Quota (models exist, most
UIs do not).

## Ownership
| Area | Owner |
|---|---|
| `web/app/w/**`, `web/app/(auth)/**`, `web/app/try/**`, `web/app/docs/**`, `web/app/s/**` (new), `web/app/api/**` | CLOUD |
| `web/components/shell/**`, `web/components/trace/**`, `web/components/app/**` (new), `web/components/ui/**` (new) | CLOUD |
| `web/lib/**` except the generated `method-ridges.ts` and `recorded-run.ts` | CLOUD |
| `web/prisma/**` (schema + migrations), `web/e2e/**` (new), seed script | CLOUD |
| `service/**` | CLOUD (tell LOCAL before changing the NDJSON event contract) |
| `web/app/page.tsx`, `web/app/layout.tsx`, `web/app/globals.css`, `web/components/landing/**`, `web/public/**` | LOCAL |
| `engine/**`, `scripts/**`, data, figures, reports | LOCAL |
| deploy (Fly.io service, Vercel web, Neon prod), `.github/workflows/**`, Dockerfiles, `README.md` | LOCAL |
| integration into main | LOCAL |

## CLOUD tasks, in order (claim in your status as you start each)
- **C1 Foundations for app UI.** A small in-repo component kit in `web/components/ui/` (button,
  input, select, dialog, dropdown, tabs, toast, skeleton, empty state, data table) consistent with
  the design skill (Chakra Petch UI text, Azeret Mono for data, tokens from globals.css, ramp for
  rank). Radix primitives are fine. Then apply it across existing workspace pages: loading,
  empty and error states everywhere, no layout shift.
- **C2 Benchmark suites.** Create a suite from programs, run it across methods (rule, A*, random
  baseline; LLM only if the service reports it available), SuiteRun progress live, results page
  with per-method cost reduction distribution, verification outcomes, per-program table, CSV export.
- **C3 Analytics dashboard** per workspace: runs over time, cost reduction by method and category,
  verification outcomes, most applied transformations, slowest programs. Real DB data only.
  Chart library of your choice that can be themed to the tokens (visx or plain SVG preferred).
- **C4 Share links.** Public read-only pages for a run and a suite at `/s/[token]`, revocable,
  optional expiry, dynamic Open Graph images via `next/og` so a pasted link previews well.
- **C5 API keys + public REST API v1.** Workspace-scoped hashed keys with scopes, create/revoke UI
  (show once), `/api/v1/optimize` (streaming), `/api/v1/runs`, `/api/v1/programs`, per-key rate
  limit via the Quota model, OpenAPI 3.1 spec, an API reference page, audit log entries.
- **C6 Playground upgrade (/try).** Code editor with MiniLang highlighting (CodeMirror 6 or
  Monaco), live TAC listing and CFG graph of the input, before/after diff with the streamed
  decision trace, shareable URL state. This is the demo centrepiece: make it feel instant.
- **C7 Command palette + keyboard shortcuts** (cmdk): jump to projects/programs/runs, run
  program, switch workspace. Toasts for async actions, optimistic updates where safe.
- **C8 Demo data + e2e.** A seed script that builds a realistic demo workspace from engine output
  (a subset of the corpus with real runs), a read-only demo login, Playwright e2e for sign-in,
  run a program, suite run, share link, API key. Ask LOCAL to add the e2e job to CI.

## Stretch (claim in status)
- Run comparison view: two runs side by side, transformation-by-transformation diff.
- Notifications: suite finished, member added (in-app bell, SSE).
- Program versioning with a diff of source between versions.
- Workspace usage page from Quota (requests, compute seconds) with limits.
- Accessibility pass: keyboard focus, aria, contrast in both themes.

## LOCAL tasks (for your awareness; do not edit these paths)
- L1 Landing page rebuilt in real WebGL (React Three Fiber): ridgeline and run trajectory as lit
  3D scenes with bloom, Blender-made assets, 60 fps, reduced-motion fallback.
- L2 Deploy: service on Fly.io (Dockerfile, fly.toml), web on Vercel, Neon prod branch, env,
  GitHub Actions deploy, Sentry, health checks.
- L3 Integration of CLOUD work into main, Windows-side checks, lockfile resolution.
- L4 Engine-side data for the dashboards and seed (exports from the 4,500-run grid).
- L5 README (product first), demo GIF, architecture diagram. Reports later.
