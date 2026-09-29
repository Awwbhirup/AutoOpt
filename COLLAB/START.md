# START HERE (cloud session)

You are **CLOUD**: a Claude Code session on Anthropic's cloud VM, working on the AutoOpt repo.
The other worker is **LOCAL**: a Claude Code session on the owner's Windows laptop, same model.
You cannot talk to each other directly. You talk through this `collab` branch and your own branch.

This branch is scratch space. It is deleted when the build is done and never merged. `main` is the
product, and nothing on `main` may look AI-assisted (see RULES.md, it is non-negotiable).

## Read in this order before touching code
1. `COLLAB/RULES.md`: repo rules, commit rules, check commands. Mandatory.
2. `COLLAB/PROTOCOL.md`: how we share work without conflicts. Mandatory.
3. `COLLAB/BOARD.md`: the task split and who owns which files.
4. `context/design-SKILL.md`: the settled design rules. Do not re-litigate them.
5. `context/PLAN.md` if present: the original project plan (subject requirements, sections 3
   and 6). It may be absent; the engine already meets those requirements and your tasks are product.
6. `context/owner-notes.md`: what the owner wants, in his words, condensed.
7. `COLLAB/STATUS-local.md`: what LOCAL is doing right now.

## One-time setup in your VM
```bash
# context lives in a second worktree so your code branch never contains it
git fetch origin collab main
git worktree add ../ctx origin/collab      # re-run `git -C ../ctx pull` style refresh: see PROTOCOL.md

# identity: commits must be the owner's, never an assistant's
git config user.name "Awwbhirup"
git config user.email "abhirupbanik98754@gmail.com"

# commit guards (reject attribution, AI words, non-ASCII, mixed status commits)
cp ../ctx/COLLAB/hooks/commit-msg .git/hooks/commit-msg
cp ../ctx/COLLAB/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/commit-msg .git/hooks/pre-commit
# if this checkout is a worktree, use: cp into "$(git rev-parse --git-common-dir)/hooks/"

# python (3.12) for engine + service
python3 -m venv .venv && . .venv/bin/activate
pip install -e "engine[dev]" && pip install -e "service[dev]"

# web (node 22, npm, never pnpm)
cd web && npm ci && npx prisma generate && cd ..

# a local Postgres for the app (no secrets are shared with you; use your own DB)
sudo apt-get update && sudo apt-get install -y postgresql
sudo service postgresql start
sudo -u postgres psql -c "create user autoopt with password 'autoopt' createdb;"
sudo -u postgres psql -c "create database autoopt owner autoopt;"
# web/.env for YOUR VM only (gitignored, never commit it):
#   DATABASE_URL=postgresql://autoopt:autoopt@localhost:5432/autoopt
#   DIRECT_URL=postgresql://autoopt:autoopt@localhost:5432/autoopt
#   AUTH_SECRET=<openssl rand -base64 32>
#   AUTH_GITHUB_ID=dummy  AUTH_GITHUB_SECRET=dummy   (password sign-in works without GitHub)
#   AUTOOPT_SERVICE_URL=http://localhost:8000
cd web && npx prisma migrate deploy && cd ..
# service: cd service && ../.venv/bin/python -m uvicorn autoopt_service.app:app --port 8000
# web:     cd web && npm run dev
```
If `apt-get` is unavailable, say so in your status file and work on what does not need a DB
(components, API contracts, unit tests), and LOCAL will run the DB-backed checks.

LLM keys are NOT available to you. Rule-based and A* methods run without keys; do not add code
paths that require a key to build, test, or render a page.

## Then
Pick the first unclaimed CLOUD task on the board, write your claim into your status file
(PROTOCOL.md says how), and build. Keep going task after task without waiting for anyone.
Check `STATUS-local.md` and `BOARD.md` for changes between tasks.
