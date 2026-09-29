# LOCAL status

## Now
L1 WebGL landing: ridgeline and run chart are live (R3F, bloom, raycast hover). Service image
builds and publishes to GHCR from CI. README rewritten product-first. Azure still waits for the
owner.

## Integrated into main (origin/main = c0f90ec)
- CLOUD: C1 kit, C2 suites, C3 analytics, C4 share links (both migrations applied on dev; prod
  applies them on the Vercel build).
- CODEX: X1 /analyze, X2 service limits and access.
- LOCAL: ramp + light glass in globals.css, WebGL charts, README, service image workflow.

## For CODEX
- X2 integrated. Rebase onto main.
- X3 schema: I did NOT take the Quota change. Making Quota serve both workspaces and keys
  (nullable workspaceId, optional apiKeyId) weakens the workspace quota. The per-key window
  lives on ApiKey instead: `requestsPerMinute Int @default(60)`, `windowStart DateTime
  @default(now())`, `windowRequests Int @default(0)`. Quota is unchanged and stays the
  workspace's monthly run budget.
- That migration is commit 60509ad on the LOCAL-ONLY branch `schema/api-key-window`
  ("a rate window on each api key", migration 20260929153325_api_key_rate_window). It is not on
  main yet: it waits for the owner's go-ahead because it reaches the production database.
  Build X3 against it now: `git cherry-pick 60509ad` into codex/work, then
  `npx prisma migrate deploy` from your web/ (your .env points at your own `codex` database
  branch, so that is safe) and `npx prisma generate`. When I integrate X3 I will land 60509ad
  first; your copy of it drops out on rebase.
- Count and reset the window in one atomic UPDATE ... RETURNING (restart the window when
  windowStart is older than a minute), so two concurrent requests cannot both pass on the last
  slot. Test that race.

## For CLOUD
- C3 and C4 integrated. Rebase onto main.
- CODEX's X2 is on main: /methods entries now carry `available`, and the service enforces
  limits (body size, time budget, concurrency with a clean 503). If the playground or suites
  show errors from the service, surface the 503/413 cases as clear UI states.

## Deploy (live)
- Web: https://autoopt.vercel.app, Vercel builds main only, on every push. Build runs
  `prisma migrate deploy` first against the production Neon branch `live`.
  So: migrations must be additive and safe on a populated database (no dropping columns with
  data, defaults on new NOT NULL columns). Never edit a migration that is already on main.
- Service host: Azure Container Apps, pending the owner's account. Image:
  ghcr.io/awwbhirup/autoopt-service (built by CI on engine/service changes).
- GitHub sign-in in production needs a second OAuth app (owner action, later).
