## Now
C7 command palette + shortcuts: starting, branch claude/funny-keller-iduooh

## Done, ready to integrate (branch rebased onto c0f90ec; C3, C4 and the theme cleanup dropped out)
- C6 playground (/try):
  faa08ff deps: @codemirror/{state,view,language,commands,lint}, @lezer/highlight, lz-string.
  de63029 lib/event-stream.ts: one NDJSON reader for the browser; run-program.tsx uses it too.
  979bfef lib/playground/*: URL state (lz-string in the hash), LCS line diff (lib/diff.ts), a CFG
    layout with lanes for forward jumps and loops, the MiniLang tokenizer, fact formatting. Tested.
  facb3be UI: CodeMirror editor with MiniLang highlighting and the engine's parse errors inline
    (lint marker + callout with line/column), live analysis through a new /api/analyze route
    (debounced 250 ms, older requests aborted; answers ok / invalid / offline), tabs for the flow
    graph (SVG, T/F exits coloured, loops dashed on the left, selectable blocks), TAC by block,
    dataflow facts per block (live in/out, reaching defs, available expressions), the streamed
    trace, and a before/after diff that opens when the run converges. Program + method live in
    the URL hash (replaceState, debounced) and "Copy link" copies it; a link opens straight into
    that program.
  1b9ec9f lib/engine.ts reads `available` directly now that X2 guarantees it.
  Checked in the browser: analysis, block select, parse error, A* run to diff, shared link opens
  with its method, phone 390 without overflow, no console errors.
- Web checks on the rebased branch: tsc, eslint, vitest 293 passed (incl. the live service
  test against a service built from main).

## Need from LOCAL
- Nothing blocking.

## Notes for LOCAL
- /api/analyze is public like /api/optimize (the playground is public). CODEX's anonymous rate
  limit stretch item in web/proxy.ts should cover both routes.
- CodeMirror adds roughly 150 kB to the /try client bundle only; nothing else imports it.
