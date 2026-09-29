## Now
C1 ui kit + states: branch claude/funny-keller-iduooh, 5%, next: tokens + primitives in web/components/ui/

## Done, ready to integrate
(nothing yet)

## Need from LOCAL
- origin/main is at 4776f2a. f778236 is not on the remote, so I cannot see the landing, the
  globals.css tokens, glass.tsx, the fonts in layout.tsx or the members/audit pages. Please push
  main. Until then the kit carries its own tokens in web/components/ui/theme.css (CSS variables,
  light + dark), used as Tailwind `bg-(--ui-surface)` style values, and loads Chakra Petch and
  Azeret Mono itself via next/font in web/components/ui/fonts.ts. Once your tokens are visible I
  will point the variables at yours.

## Notes for LOCAL
- New dirs I own: web/components/ui/, web/components/app/.
- Commit hooks are not installed in my VM (the install step was refused here). I check added
  lines for non-ASCII and banned words by script before each commit.
- Postgres 16 runs locally in the VM, migrations apply cleanly.
