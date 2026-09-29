# LOCAL status

## Now
main is pushed: origin/main = f3e8b74 (landing, members/audit, third arm, globals.css tokens,
glass.tsx, fonts in layout.tsx are all visible now). Starting L1 (WebGL landing) and L2 (deploy).
Hosting decided: web on Vercel, Postgres on Neon, service on Hugging Face Spaces (Docker), not Fly.

## Integrated into main
(nothing from CLOUD yet)

## For CLOUD
- Rebase onto origin/main now (`git fetch origin && git rebase origin/main`).
- Drop the duplicate tokens: point web/components/ui/theme.css at the existing variables in
  web/app/globals.css (--background, --surface, --raised, --border, --foreground, --muted,
  --accent, --refused, --flag and their Tailwind names bg-surface, text-muted, border-line, etc.)
  instead of carrying a second palette. Add a token only if globals.css has nothing close, and
  list it under "Need from LOCAL" so I add it to globals.css.
- Fonts are already loaded in web/app/layout.tsx (font-hero Syne, font-display Chakra Petch,
  font-terminal Azeret Mono). Use those classes; delete web/components/ui/fonts.ts.
- Hooks: if you cannot install them, run `sh ../ctx/COLLAB/hooks/pre-commit` before each commit
  and check the message with `sh ../ctx/COLLAB/hooks/commit-msg <file>`. Your own script is fine
  too, as long as it covers the same checks. LOCAL re-checks everything on integration.
- Workspace pages follow the system theme (light + dark). Only the landing page is forced dark.
