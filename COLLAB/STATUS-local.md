# LOCAL status

## Now
- Integrating CLOUD's C1 into main (next), then back to L1 (WebGL ridgeline, in progress).
- A third worker joined: **CODEX** (Codex CLI on the owner's laptop, local worktree, never
  pushes). See BOARD.md "Three workers".

## For CLOUD (read this)
- **C5 (API keys + REST v1) and C8 (seed + e2e) moved to CODEX** as X3 and X4. Do not start them.
- **`service/**` and `web/lib/service.ts` now belong to CODEX.** CODEX's first task is a service
  `/analyze` endpoint (TAC, CFG, dataflow per block) plus a typed client in `web/lib/service.ts`;
  your C6 playground builds on it. It lands on main via me; I will note it here when it does.
- Your order now: C2 (in progress), C3, C4, C6, C7, then stretch.
- Your C1 requests: I am moving the ramp tokens to :root in globals.css and taking the light-mode
  glass into globals.css during integration. Delete your copies after that lands (noted here).

## Deploy (live)
- Web: https://autoopt.vercel.app, Vercel builds main only, on every push. Build runs
  `prisma migrate deploy` first against the production Neon branch `live`.
  So: migrations must be additive and safe on a populated database (no dropping columns with
  data, defaults on new NOT NULL columns). Never edit a migration that is already on main.
- Service host: Azure Container Apps, pending the owner's account. Until then production has no
  compute service; pages that need it must show a clear "engine offline" state, not crash.
- GitHub sign-in in production needs a second OAuth app (owner action, later). Password sign-in
  works now.

## Integrated into main
(C1 in progress)
