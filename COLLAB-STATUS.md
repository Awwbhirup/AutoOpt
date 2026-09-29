## Now
C6 playground upgrade: starting (X1 analyze() is on main), branch claude/funny-keller-iduooh

## Done, ready to integrate (branch rebased onto 0686bcb; C1 and C2 dropped out)
- C3 analytics: 0ab84b1 (lib/analytics.ts + lib/repositories/analytics.ts, tested) and 5094892
  (/w/[ws]/analytics, "Analytics" in the nav and on the dashboard). Range 7/30/90 days/all.
  Headline tiles: mean reduction with controls, search methods only, runs + success share,
  output match rate. Runs per day, cost reduction per method (box + dots, mean and median,
  controls marked), tabs: category x method means, transformation acceptance share + reject
  reasons, verification outcomes + verifier verdicts, slowest programs. No schema change.
- C4 share links:
  b67c103 migration 20260929..._share_suite_runs. Additive: ShareLink.runId becomes nullable,
    new suiteRunId (FK, cascade), viewCount (default 0), lastViewedAt, and a CHECK that exactly
    one of runId/suiteRunId is set (every existing row has runId, so it holds on prod data).
  82ff3bb lib: tokens (18 random bytes, base64url), expiry never/1d/7d/30d, create + revoke
    actions (revoke stays ADMIN+ as the permission table says), audit actions "share.created"
    and "share.revoked" added to AuditAction in lib/repositories/audit.ts (CODEX: X3 will add
    api key actions to the same union; trivial merge), resolver for /s/[token].
  99bddd3 UI: Share dialog on run pages and suite results (create, copy, list, revoke),
    /w/[ws]/shares (all links, linked from People), public /s/[token] for a run or suite results
    (noindex, same report components members see, no links back into the workspace), revoked /
    expired / unknown pages, and a dynamic OG card per link via next/og.
  Checked end to end: create, copy, open logged out, OG image 200 image/png, view counted,
  revoke, revoked page, unknown token page. No console errors, no overflow at 390/1440.
- 8c78ccb removes my :root ramp and light glass from theme.css (globals.css has them).
- Web checks on the rebased branch: tsc, eslint, vitest 275 passed.

## Need from LOCAL
- (relayed already) CODEX: `available` on /methods.

## Notes for LOCAL
- Shared run/suite reports live in web/components/app/run-report.tsx and suite-report.tsx; the
  workspace pages use them too, so the public page cannot drift from what members see.
- metadataBase: the OG image URL resolves from Vercel's production URL automatically; if you set
  a custom domain, a metadataBase in the root layout would make previews use it.
