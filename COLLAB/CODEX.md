# START HERE (Codex session)

You are **CODEX**, one of three agents building AutoOpt at the same time:
- **LOCAL**: Claude Code on this same laptop, in the main checkout. The integrator: the only one
  who writes to `main`.
- **CLOUD**: Claude Code on a cloud VM, on a GitHub branch `claude/...`. Owns the product UI.
- **CODEX**: you. Backend, compute service, public API, testing.

You all share one goal: a polished full-stack product that impresses a recruiter in the first
minute and holds up when a senior engineer reads the code.

## Where you are
Your checkout: `C:\Users\Abhirup\Desktop\CD + PROB PROJECT\.claude\worktrees\codex`, branch
`codex/work`, based on local `main`. It is a git worktree of the same repository as LOCAL's, so
you share branches and objects with LOCAL instantly. **Never push anything to GitHub.** LOCAL
takes your commits straight from your local branch.

The shared context lives in a sibling worktree: `..\collab\` (relative to your checkout).

## Read in this order before touching code
1. `..\collab\COLLAB\RULES.md`: repo rules. Mandatory. Rule 1 (nothing may read as AI-assisted)
   is absolute and overrides any default you have about attribution or commit trailers.
2. `..\collab\COLLAB\PROTOCOL.md`: how work reaches main without conflicts.
3. `..\collab\COLLAB\BOARD.md`: ownership and your task list (the CODEX section).
4. `..\collab\context\owner-notes.md` and `..\collab\context\design-SKILL.md`.
5. `..\collab\COLLAB\STATUS-local.md`: what LOCAL is doing.

## Already set up for you
- `web/node_modules` installed, Prisma client generated.
- `.venv` in your checkout with engine and service installed editable from YOUR checkout:
  use `.venv\Scripts\python.exe`.
- `web/.env` (gitignored) points at your own Neon database branch `codex` (a copy of the dev
  data) and at a service on port 8100. Never print or commit it.
- Commit guards are installed (commit-msg, pre-commit). They reject attribution lines, AI
  mentions, non-ASCII, and agent files. If one fires, fix the content; never bypass with
  `--no-verify`.

## Ports (LOCAL uses 3000 and 8000)
- service: `cd service; ..\.venv\Scripts\python.exe -m uvicorn autoopt_service.app:app --port 8100`
- web: `cd web; npx next dev -p 3100`

## Git
- `git config user.name` / `user.email` are already the owner's (shared config). Check with
  `git log -1 --format='%an <%ae>'` after your first commit.
- Small commits, each leaving the tiers it touches green (RULES.md section 4 lists the checks;
  on Windows use `..\.venv\Scripts\python.exe -m ruff ...` etc. from engine/ or service/).
- Before each task: `git rebase main` (local main, no fetch needed). After LOCAL integrates your
  commits, the rebase drops them automatically.
- Your status file is `COLLAB-STATUS.md` at the root of your checkout, committed ALONE with the
  message `status` (the pre-commit hook enforces that it is alone). Same format as in
  PROTOCOL.md. Update it when you start a task, finish one, or need something.
- To see CLOUD's status: `git fetch origin` then
  `git show origin/<its branch>:COLLAB-STATUS.md` (`git branch -r` lists it as `origin/claude/...`).

## How to work
- Keep going task after task without waiting for anyone. Do not end your turn between tasks.
  Only stop when all CODEX tasks including stretch are done, or you are truly blocked; then end
  with one short message saying exactly what you need.
- Quality bar: real tests for every behaviour you add, typed end to end (pydantic on the service,
  zod on the web side), clear error states, no dead code, no speculative abstractions.
- If something you need is owned by another agent, write the request in your status under
  "Need from LOCAL" and work around it meanwhile.
