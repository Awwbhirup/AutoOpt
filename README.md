# AutoOpt

An agent that optimizes programs and checks every change before keeping it.

Feed it a program. It lowers to three address code, looks for optimization
opportunities, proposes a transformation, checks the result still behaves the
same, measures whether it is actually cheaper, and keeps the change only if
both hold. Repeat until nothing improves, logging every decision on the way.

Compiler design project (Project 5), with the run data also used for the
statistics coursework.

Status: engine front end done (parser, TAC, CFG, interpreter). Analyses,
transformations and the agent loop are next.

## Why bother

Compilers run optimizations in a fixed order, but the order matters. Doing CSE
before dead code elimination gives different output than the other way round,
and picking a good order is a hard search problem. Separately, a transformation
that looks safe but isn't will quietly break the program.

AutoOpt treats both as the actual problem: it searches over orderings instead
of following a fixed pipeline, and no change gets kept without passing a
verification step.

## How it works

```
source -> parser -> TAC + CFG
                      |
                      v
        +-------------------------------------+
        |  Orchestrator                       |
        |                                     |
        |   analyse -> propose -> verify      |
        |      ^                     |        |
        |      |                     v        |
        |   accept/reject <---- evaluate cost |
        +-------------------------------------+
                      |
                      v
          optimized TAC + decision log
```

Five components, per the project spec:

| Component | Job |
|---|---|
| Orchestrator | runs the analyse/propose/verify/evaluate loop until nothing improves |
| Code Analysis Specialist | dataflow analyses produce facts, a forward chaining rule engine turns them into opportunities |
| Optimization Specialist | proposes one transformation, either rule based or from an LLM |
| Verification Module | differential testing plus Z3 equivalence checking |
| Cost Evaluator | weighted cost over instruction count, arithmetic ops, temporaries, execution time |

A change is kept only if it verifies AND lowers cost.

## What verification actually means

Not a claim that arbitrary programs are proven equivalent. Two things happen:

- both versions run over generated and edge case inputs and their output
  traces are compared, which is evidence rather than proof
- both get encoded into SSA and Z3 is asked whether they can differ, which is
  a proof over the supported subset of the IR

Loops are unrolled to a bound, so those come back as `unknown_bounded` rather
than proven. The decision log keeps that distinction instead of flattening it
into a pass.

## Layout

```
engine/
  autoopt/
    lang/       lexer, parser, AST, declaration checking
    ir/         three address code, CFG, dominators, loop depth
    interp/     TAC interpreter
    analysis/   liveness, available expressions, reaching defs, constants
    rules/      forward chaining rule engine
    transforms/ the optimization catalog
    verify/     differential testing, Z3
    cost/       cost model
    search/     baseline, greedy, A*, hill climbing, annealing, bayes
    orchestrator/
    datagen/    corpus generator
    stats/      ANOVA, regression, distribution fits, reliability
    figures/    plots
    report/     decision logs and summaries
    events.py   decision log event contract
data/           generated corpus and run logs, gitignored
```

## Running it

```bash
make install
make test
```

Corpus and full experiment:

```bash
make corpus
make experiment
make analyze
```

`make reproduce` regenerates everything from scratch. Seeded throughout and
LLM responses are cached, so repeated runs give the same output.

## Config

Copy `engine/.env.example` to `engine/.env` and fill in keys. The LLM part is
optional, set `AUTOOPT_LLM_PROVIDER=stub` to run with no network at all.

## Notes

The engine is a plain library with no printing, network or database calls. It
reports what it did through a callback, and the batch runner, the report
renderer and the web UI all read that same event stream, so the numbers in a
report and the numbers in a live demo come from one place.

## Licence

MIT
