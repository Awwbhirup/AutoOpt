# Protocol: two workers, one main, no conflicts

## Branches
| Branch | Who writes | What |
|---|---|---|
| `main` | LOCAL only | The product. LOCAL is the single integrator. CLOUD never pushes here. |
| `collab` | LOCAL only (except CLOUD's status file, see below) | This context. Orphan branch, never merged, deleted at the end. |
| your session branch (e.g. `claude/...`) | CLOUD only | All CLOUD code work, based on `origin/main`. |

If your git proxy lets you push other branch names, you may use `cloud/<task>` branches instead of
one session branch. Same rules apply. Never open pull requests (PR pages outlive branches and
would show the collaboration publicly).

## CODEX (third worker, local)
CODEX works in the local worktree `.claude/worktrees/codex` on branch `codex/work`, which is never
pushed. Its status is `COLLAB-STATUS.md` at the root of that branch, same rules as CLOUD's.
LOCAL cherry-picks its code commits onto main exactly as for CLOUD. CLOUD can read CODEX's work
only once it is on main; if CLOUD needs something from CODEX sooner, ask LOCAL in your status.

## Status files: each file has exactly one writer
- `COLLAB/STATUS-local.md` on `collab`: written by LOCAL. You read it.
- CLOUD status: write it to `COLLAB-STATUS.md` at the **repo root of your session branch**.
  - Commit it **alone**, message exactly `status`. Never in the same commit as code (the pre-commit
    hook refuses mixed commits).
  - LOCAL fetches your branch and reads it. LOCAL never merges that file into main.
  - If you can push to `collab`, you may instead keep it at `COLLAB/STATUS-cloud.md` there.

Status file format (keep it short, overwrite rather than append history):
```
## Now
C3 api keys + public api: branch <name>, 60%, next: rate limits
## Done, ready to integrate
- C1 benchmark suites: commits abc123..def456, checks green
## Need from LOCAL
- globals.css: a --chart-grid token (I used a local var meanwhile)
- secrets / accounts / anything needing Windows, GPU, Blender
## Notes for LOCAL
- changed Run.status enum: added QUEUED (migration 0012)
```

## How code gets to main
1. You build on your branch, based on the latest `origin/main`. Small commits, each one passing
   the checks for the tier it touches (RULES.md lists them). Code commits follow the commit style.
2. When a task is done and green, move it to "Done, ready to integrate" in your status, and push.
3. LOCAL fetches your branch, cherry-picks your code commits (not the `status` commits) onto main,
   runs the full check suite on Windows, and pushes main. LOCAL notes it in STATUS-local.md.
4. You then run `git fetch origin && git rebase origin/main`. Cherry-picked commits drop out on
   their own (same patch), leaving only unmerged work and status commits. Force-push your branch
   (`git push --force-with-lease`). If force-push is refused, `git merge origin/main` instead.
5. Rebase on `origin/main` at the start of every new task, so conflicts stay small.

## File ownership (the actual conflict prevention)
BOARD.md lists who owns which paths. Rules:
- Edit only paths you own. For anything else, ask in your status under "Need from LOCAL", and
  work around it meanwhile (local variable, wrapper component, TODO in your own file).
- Shared files with a single owner:
  - `web/prisma/schema.prisma` + `web/prisma/migrations/**`: **CLOUD owns.** LOCAL asks you.
    One migration per change, named for what it does. Never edit an existing migration.
  - `web/app/globals.css`, `web/app/layout.tsx`, `web/app/page.tsx`: **LOCAL owns.**
  - `web/package.json` + `package-lock.json`: **either may add a dependency**, in its own commit
    titled for why it is needed (e.g. `a command palette needs cmdk`). Lockfile conflicts are
    resolved by LOCAL with `npm install` during integration. Never remove or bump a dependency the
    other side added without asking.
  - `.github/workflows/**`: **LOCAL owns.** Ask for CI changes.
  - `README.md`: **LOCAL owns.**
- New directories you create are yours. Say so in your status the first time.

## Sync cadence
- Between tasks: `git fetch origin collab main`, then refresh the context worktree
  (`git -C ../ctx checkout --detach origin/collab`), read `STATUS-local.md` and `BOARD.md`.
- LOCAL reads your status every time it integrates, and at least every ~30 minutes of its work.
- The board changes only via LOCAL. If you want a task added, reordered or reassigned, ask in your
  status. If you run out of tasks, pick from the "Stretch" list and claim it in your status.

## When blocked
Never wait idle. Note the blocker in your status, stub around it, take the next task.
