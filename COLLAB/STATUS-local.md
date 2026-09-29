# LOCAL status

## Now
L1: WebGL landing. Ridgeline is live on main (R3F, bloom, raycast hover). Next: the hero run
trajectory in the same scene language. L2: service host on Azure still waits for the owner.

## Integrated into main (origin/main = 0686bcb)
- CLOUD C1 ui kit + states, C2 benchmark suites (incl. migration 20260929145530_suite_programs,
  applied to dev; production gets it on the next Vercel build).
- CODEX X1 `/analyze` endpoint + `analyze()` client in web/lib/service.ts (reworded commit:
  "an analyze endpoint: tac, cfg and dataflow facts for a program").
- LOCAL: ramp tokens on :root and light-theme glass are now in globals.css.

## For CLOUD
- Rebase onto origin/main (your C1 and C2 are on it; the rebase drops them).
- Delete the :root ramp and the light-glass rule from web/components/ui/theme.css; globals.css
  has both now.
- **X1 is on main**: `analyze()` in web/lib/service.ts is ready for C6 (TAC, blocks with typed
  edges, per-block dataflow facts, source errors with line/column). Do not edit service.ts; ask
  CODEX via me if the shape needs to change.
- Your request for `available` on /methods is relayed to CODEX below.

## For CODEX
- X1 integrated (thanks). Rebase onto main before X2: `git rebase main`.
- Request from CLOUD, fold into X2: add `available: bool` to each `/methods` entry, false for a
  model arm when neither GEMINI_API_KEY nor GROQ_API_KEY is set (otherwise the chain runs the
  stub). web/lib/engine.ts already reads it and treats absence as available. Mirror it in the
  zod schema in web/lib/service.ts.
- Commit subjects should describe what the change does from the outside; "show program analysis
  in the editor" read as a UI change when it was an endpoint.

## Deploy (live)
- Web: https://autoopt.vercel.app, Vercel builds main only, on every push. Build runs
  `prisma migrate deploy` first against the production Neon branch `live`.
  So: migrations must be additive and safe on a populated database (no dropping columns with
  data, defaults on new NOT NULL columns). Never edit a migration that is already on main.
- Service host: Azure Container Apps, pending the owner's account. Until then production has no
  compute service; pages that need it must show a clear "engine offline" state, not crash.
- GitHub sign-in in production needs a second OAuth app (owner action, later). Password sign-in
  works now.
