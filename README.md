# AutoOpt

A compiler optimizer that proves its work. Paste a program, watch it get
lowered to three-address code, and see every proposed rewrite either kept or
refused, with the reason, as it happens.

**Live:** https://autoopt.vercel.app

Each candidate transformation has to pass two gates before it is kept: it must
behave exactly like the original (differential testing plus a Z3 equivalence
check), and it must actually lower a weighted cost. Most proposals fail one of
the two, and the decision log says which.

## What is in it

**The product** (`web/`, Next.js 16, React 19, TypeScript)

- Workspaces with owner, admin, member and viewer roles, enforced on the
  server, and an audit log of who changed what.
- Projects and programs, with runs that stream the optimizer's decisions live
  over server-sent events and keep the full trace afterwards.
- Benchmark suites: pick programs, run them across several methods as a queue
  the database holds, and compare the methods on cost reduction and
  verification outcomes.
- Workspace analytics: headline numbers first, then cost reduction per method
  with the control methods marked, transformation acceptance, verification
  outcomes and the slowest programs, over any date range.
- Share links for a run or a suite's results: public, read-only, revocable,
  optionally expiring, with a generated preview image for when the link is
  pasted somewhere.
- A playground at `/try` that needs no account: an editor with parse errors
  inline, and as you type the control-flow graph, the TAC and the dataflow
  facts per block. Run it to watch the decision log stream in and get a
  before/after diff; the program and method live in the URL, so a link opens
  straight into it. A language reference is at `/docs`.
- Sign in with GitHub or with email and password (Auth.js, Prisma, Postgres).
- A landing page whose charts are the real experiment data, drawn in WebGL
  with React Three Fiber.

**The compute service** (`service/`, FastAPI)

Stateless. Takes a program, runs the optimizer and streams the decision log as
NDJSON. It also returns the TAC, control-flow graph and per-block dataflow
facts for a program without optimizing it. It stores nothing; everything
persistent belongs to the web tier.

It runs on Vercel as a Python function at autoopt-engine.vercel.app, with only
the libraries a request needs (`service/vercel`), and answers only callers that
send its token. Every push to main that passes CI redeploys it
(`.github/workflows/deploy-service.yml`), the same way the web app redeploys
through Vercel's GitHub integration; `scripts/deploy-service.ps1` does it by hand. `service/Dockerfile` builds the same
service as an image for hosting it anywhere else.

**The engine** (`engine/`, Python 3.12)

| Part | What it does |
|---|---|
| Front end | lexer, recursive-descent parser, declaration checks |
| IR | three-address code, CFG, dominators, loop depth, an interpreter |
| Analysis | liveness, available expressions, reaching definitions, constants |
| Rules | a forward-chaining rule engine that turns facts into opportunities |
| Transforms | eight rewrites, from constant folding to dead code elimination |
| Search | fixed pipeline, greedy, A*, hill climbing, simulated annealing, a random baseline, and language-model arms |
| Verification | differential testing over generated inputs, then Z3 over SSA |
| Cost | weighted instruction count, arithmetic ops, temporaries, execution time |

## Architecture

```
 browser
    |
    v
 Next.js on Vercel ---- Postgres (Neon)
    |   auth, RBAC, runs, suites, audit
    | HTTP, NDJSON stream
    v
 FastAPI compute service (Vercel function, or Docker)
    |
    v
 engine: parse -> TAC + CFG -> analyse -> propose -> verify -> cost -> keep or refuse
```

The engine never prints, touches the network or a database. It reports through
a callback, and the batch runner, the report generator and the live trace in
the browser all read that same event stream, so a number in a report and a
number on screen come from one place.

## What verification means here

Not a claim that arbitrary programs are proven equivalent. Both versions run
over generated and edge-case inputs and their outputs are compared, which is
evidence. Then both are encoded in SSA and Z3 is asked whether they can
differ, which is a proof over the supported subset of the IR. Loops are
unrolled to a bound, so those come back as `unknown_bounded` rather than
proven, and the decision log keeps that distinction.

## The study

Every search method was run against the same 500 generated programs, 4,500
runs in total. The analysis (ANOVA, Tukey HSD, regression, distribution fits,
reliability) lives in `engine/autoopt/stats` and is regenerated from the run
data by `make analyze`; the charts on the landing page are generated from the
same data by `scripts/record_*.py`.

## Running it locally

Needs Python 3.12, Node 22 and a Postgres database (a free Neon project works).

With a virtualenv active:

```bash
make install        # engine and service, editable, plus web dependencies
make serve          # compute service on :8000
make app            # web app on :3000
make test           # engine, service and web tests
```

Copy `web/.env.example` to `web/.env` and fill it in. The language-model arms
are optional and read their keys from `engine/.env`.

On Windows, `scripts/demo-start.ps1` starts the service and a production build
of the web app and opens the browser; `scripts/demo-stop.ps1` stops both.

Reproducing the study:

```bash
make corpus
make experiment
make analyze
```

Seeded throughout, and model responses are cached, so repeated runs give the
same output.

## Layout

```
engine/    the optimizer, as a library
service/   FastAPI wrapper that streams the decision log
web/       Next.js app: auth, workspaces, runs, suites, landing page
scripts/   generators for the data files the site draws from, demo and deploy scripts
```
