# Board (LOCAL edits this file; CLOUD and CODEX ask for changes in their status)

Goal: a start-to-end, polished, high-fidelity full-stack product a recruiter opens and is
impressed by, that also still satisfies the Compiler Design and P&S requirements (PLAN.md sections
3 and 6, already met by the engine and data). Scope is open: big new features are welcome if they
are real and work end to end. Submission is far away; product quality comes first. The bar is
"a senior engineer would be proud of this", not "it works".

## Three workers
| Name | What | Where it works | Strength used |
|---|---|---|---|
| LOCAL | Claude Code on the owner's Windows laptop | main checkout; integrator | GPU, Blender, deploy accounts, data, final say on main |
| CLOUD | Claude Code on Anthropic's cloud VM | its session branch `claude/...` on GitHub | product UI and app features |
| CODEX | Codex CLI on the owner's laptop | worktree `.claude/worktrees/codex`, branch `codex/work` (local only, never pushed) | backend, service, public API, testing |

Current state of main: engine complete (parser, TAC/CFG, dataflow, 8 transforms, rule/LLM/A*
specialists, differential + Z3 verification, 4,500-run grid, stats). Service streams NDJSON traces.
Web: auth (password + GitHub), workspaces, members/roles, audit, projects, programs, runs with a
live SSE trace, /try playground, /docs, dark WebGL landing. Prisma has 17 models incl.
BenchmarkSuite, SuiteRun, ShareLink, ApiKey, AuditLog, Quota. Live at https://autoopt.vercel.app.

## Ownership (edit only what you own; ask for the rest)
| Area | Owner |
|---|---|
| `web/app/w/**` (except `settings/api-keys/**`), `web/app/(auth)/**`, `web/app/try/**`, `web/app/docs/**` (except `docs/api/**`), `web/app/s/**`, `web/app/api/**` (except `api/v1/**`) | CLOUD |
| `web/components/shell/**`, `web/components/trace/**`, `web/components/app/**`, `web/components/ui/**` | CLOUD |
| `web/lib/**` except the files CODEX and LOCAL own below | CLOUD |
| `web/prisma/schema.prisma` + `web/prisma/migrations/**` | CLOUD (CODEX sends schema requests to LOCAL, who applies them on main) |
| `service/**` | CODEX (the NDJSON event contract is frozen unless all three agree) |
| `web/lib/service.ts` and its tests, `web/lib/api/**` (new), `web/app/api/v1/**` (new), `web/app/w/[workspace]/settings/api-keys/**` (new), `web/app/docs/api/**` (new) | CODEX |
| `web/e2e/**`, `web/playwright.config.ts`, `web/scripts/seed.ts` (new), `web/proxy.ts` / middleware (new) | CODEX |
| `web/app/page.tsx`, `web/app/layout.tsx`, `web/app/globals.css`, `web/components/landing/**`, `web/public/**` | LOCAL |
| `engine/**`, `scripts/**`, data, figures, reports | LOCAL |
| deploy (Vercel, Neon, Azure), `.github/workflows/**`, Dockerfiles, `README.md`, `web/vercel.json` | LOCAL |
| `web/package.json` + lockfile | anyone may add a dependency in its own commit; LOCAL resolves lockfile conflicts |

## CLOUD tasks, in order
- **C1 Foundations for app UI.** DONE, integrating.
- **C2 Benchmark suites.** Create a suite from programs, run it across methods (rule, A*, random
  baseline; LLM only if the service reports it available), SuiteRun progress live, results page
  with per-method cost reduction distribution, verification outcomes, per-program table, CSV export.
- **C3 Analytics dashboard** per workspace: runs over time, cost reduction by method and category,
  verification outcomes, most applied transformations, slowest programs. Real DB data only.
  Show headline numbers first, detail one click away (owner-notes.md). Include the Cost Reduction
  metric both ways: overall average and per method, with control methods marked as baselines.
- **C4 Share links.** Public read-only pages for a run and a suite at `/s/[token]`, revocable,
  optional expiry, dynamic Open Graph images via `next/og` so a pasted link previews well.
- **C6 Playground upgrade (/try).** Code editor with MiniLang highlighting (CodeMirror 6),
  live TAC listing and CFG graph of the input (from CODEX's X1 `/analyze`, via `web/lib/service.ts`),
  before/after diff with the streamed decision trace, shareable URL state. Demo centrepiece.
- **C7 Command palette + keyboard shortcuts** (cmdk), toasts, optimistic updates where safe.
- (C5 and C8 moved to CODEX as X3 and X4.)
- Stretch: run comparison view, notifications, program versioning with source diff, usage page.

## CODEX tasks, in order
- **X1 `/analyze` endpoint** in the service: given MiniLang source, return parse errors with
  line/column, the TAC listing, the CFG (blocks with instructions, edges with kind), and the
  dataflow facts the engine already computes (liveness, reaching definitions, available
  expressions) per block. Pydantic schemas, pytest coverage, and a typed client function in
  `web/lib/service.ts` with a zod schema and vitest tests. CLOUD's C6 builds on it, so do it first
  and say so in your status the moment it is on your branch.
- **X2 Service hardening.** Optional shared-secret auth (`AUTOOPT_SERVICE_TOKEN`: if set, every
  route but /health needs `Authorization: Bearer`; `web/lib/service.ts` sends it), request size
  and program length limits, a per-request time budget, a concurrency cap with a clean 503,
  structured JSON logs with a request id, `/health` vs `/ready`, OpenAPI tags and examples. All
  tested. The NDJSON event contract does not change.
- **X3 API keys + public REST API v1** (was C5). Workspace-scoped hashed keys with scopes,
  create/revoke UI at `/w/[workspace]/settings/api-keys` (show the key once), `/api/v1/optimize`
  (streaming NDJSON), `/api/v1/runs`, `/api/v1/programs`, per-key rate limits via the Quota model,
  audit log entries, an OpenAPI 3.1 spec served at `/api/v1/openapi.json`, and a reference page
  at `/docs/api` with copyable curl examples. ApiKey and Quota already exist in the schema; if you
  need a change, put the exact Prisma diff under "Need from LOCAL".
- **X4 Demo data + e2e** (was C8). `web/scripts/seed.ts` builds a realistic demo workspace (a
  subset of the corpus with real runs through the service, not invented numbers), plus a
  read-only demo login. Playwright e2e in `web/e2e/`: sign up, sign in, create project and
  program, run it and watch the trace, suite run, share link, API key round trip. Ask LOCAL to add
  the CI job.
- Stretch: rate limiting for anonymous /try traffic (IP based, in `web/proxy.ts`), a k6 or
  autocannon load test script for the service with results in its README section, security
  review of auth and RBAC paths with tests for every denial.

## LOCAL tasks
- L1 Landing page in real WebGL (React Three Fiber): ridgeline (in progress) and run trajectory
  as lit 3D scenes with bloom, Blender-made assets, 60 fps, reduced-motion fallback.
- L2 Deploy: web on Vercel (live), Neon prod branch `live` (live), service on Azure Container
  Apps (pending account), GitHub Actions deploy, Sentry.
- L3 Integration of CLOUD and CODEX work into main, Windows-side checks, lockfile resolution,
  schema requests from CODEX.
- L4 Engine exports for dashboards and seed. L5 README, demo GIF, architecture diagram. Reports later.
