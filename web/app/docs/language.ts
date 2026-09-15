/**
 * The supported subset of MiniLang, as data.
 *
 * Read off the engine rather than written from the plan: the grammar comes from
 * the parser, the semantics from the interpreter, the catalog from the eight
 * transformations, and the bounds from the two verification channels. Every
 * correctness claim the project makes is scoped to exactly this, so a fact here
 * that the engine does not implement is worse than no page at all.
 *
 * Data rather than markup because the editor's help panel and the run report
 * need the same lists, and a second hand-written copy is a second thing to get
 * out of date.
 */

import { OPTIMIZATION_TYPES, VERIFICATION_VERDICTS } from "@/lib/events";

export type OptimizationKind = (typeof OPTIMIZATION_TYPES)[number];
export type Verdict = (typeof VERIFICATION_VERDICTS)[number];

// --- grammar -----------------------------------------------------------------

export interface Production {
  name: string;
  rule: string;
}

/** Lowest precedence first, matching the order the parser's methods call each other. */
export const GRAMMAR: readonly Production[] = [
  { name: "program", rule: "stmt* EOF" },
  {
    name: "stmt",
    rule: "inputDecl | varDecl | assign | ifStmt | whileStmt | forStmt | printStmt | block",
  },
  { name: "inputDecl", rule: "'input' IDENT ';'" },
  { name: "varDecl", rule: "'int' IDENT ('=' expr)? ';'" },
  { name: "assign", rule: "IDENT '=' expr ';'" },
  { name: "ifStmt", rule: "'if' '(' expr ')' stmt ('else' stmt)?" },
  { name: "whileStmt", rule: "'while' '(' expr ')' stmt" },
  {
    name: "forStmt",
    // The clauses are spelled out rather than deferred to varDecl and assign,
    // which carry their own ';' and would put a second one in the wrong place.
    rule: "'for' '(' (varDecl | IDENT '=' expr ';' | ';') expr ';' (IDENT '=' expr)? ')' stmt",
  },
  { name: "printStmt", rule: "'print' '(' expr ')' ';'" },
  { name: "block", rule: "'{' stmt* '}'" },
  { name: "expr", rule: "logicalOr" },
  { name: "logicalOr", rule: "logicalAnd ('||' logicalAnd)*" },
  { name: "logicalAnd", rule: "equality ('&&' equality)*" },
  { name: "equality", rule: "comparison (('==' | '!=') comparison)*" },
  { name: "comparison", rule: "additive (('<' | '>' | '<=' | '>=') additive)*" },
  { name: "additive", rule: "multiplicative (('+' | '-') multiplicative)*" },
  { name: "multiplicative", rule: "unary (('*' | '/' | '%') unary)*" },
  { name: "unary", rule: "('-' | '!') unary | primary" },
  { name: "primary", rule: "NUMBER | IDENT | '(' expr ')'" },
];

export const KEYWORDS: readonly string[] = [
  "int",
  "input",
  "if",
  "else",
  "while",
  "for",
  "print",
];

// --- operators ---------------------------------------------------------------

export interface OperatorLevel {
  level: string;
  operators: string;
  associativity: "left" | "right";
  note: string;
}

/** Tightest binding last, so the table reads the way the grammar nests. */
export const OPERATORS: readonly OperatorLevel[] = [
  {
    level: "logical or",
    operators: "||",
    associativity: "left",
    note: "Short-circuits. Result is 0 or 1.",
  },
  {
    level: "logical and",
    operators: "&&",
    associativity: "left",
    note: "Short-circuits. Result is 0 or 1.",
  },
  {
    level: "equality",
    operators: "== !=",
    associativity: "left",
    note: "Result is 0 or 1.",
  },
  {
    level: "comparison",
    operators: "< > <= >=",
    associativity: "left",
    note: "Result is 0 or 1. Chaining parses but compares the 0 or 1, not the operands.",
  },
  {
    level: "additive",
    operators: "+ -",
    associativity: "left",
    note: "Unbounded integers, so no wrapping.",
  },
  {
    level: "multiplicative",
    operators: "* / %",
    associativity: "left",
    note: "A zero divisor traps. Division truncates toward zero.",
  },
  {
    level: "unary",
    operators: "- !",
    associativity: "right",
    note: "! gives 1 for zero and 0 for anything else.",
  },
];

// --- statements --------------------------------------------------------------

export interface StatementForm {
  form: string;
  syntax: string;
  note: string;
}

export const STATEMENTS: readonly StatementForm[] = [
  {
    form: "input declaration",
    syntax: "input n;",
    note: "Declares a free variable. It is bound before the run and reads nothing at runtime, so it costs no instruction. Declaration order is the order verification supplies values in.",
  },
  {
    form: "variable declaration",
    syntax: "int x = e;",
    note: "The initializer is optional and defaults to 0, so every variable holds a value everywhere and equivalence stays well defined.",
  },
  {
    form: "assignment",
    syntax: "x = e;",
    note: "The target must already be declared.",
  },
  {
    form: "conditional",
    syntax: "if (e) stmt else stmt",
    note: "The else branch is optional. Since a branch is any statement, else if chains work.",
  },
  {
    form: "while loop",
    syntax: "while (e) stmt",
    note: "The condition is re-evaluated every iteration. Hoisting it out is loop-invariant code motion's job, and only when the analysis proves it safe.",
  },
  {
    form: "for loop",
    syntax: "for (init; e; update) stmt",
    note: "The initializer and the update may be left out; the condition may not. Surface syntax only: lowering rewrites it to init followed by a while with the update at the end of the body, so nothing downstream knows it was a for.",
  },
  {
    form: "print",
    syntax: "print(e);",
    note: "The only observable effect in the language, and the reason it can never be removed.",
  },
  {
    form: "block",
    syntax: "{ stmt* }",
    note: "Groups statements. It does not open a scope.",
  },
];

// --- semantics ---------------------------------------------------------------

export interface SemanticRule {
  topic: string;
  rule: string;
}

/**
 * The parts of the meaning that verification depends on. Both channels have to
 * agree on all of these or a proof would be about a different language than the
 * one that runs.
 */
export const SEMANTICS: readonly SemanticRule[] = [
  {
    topic: "Values",
    rule: "One type: mathematical integers, unbounded, with no wrapping. This is what lets the interpreter and the Z3 encoding be compared at all, since Z3 integers behave the same way.",
  },
  {
    topic: "Division",
    rule: "Truncates toward zero as C99 does, so -7 / 2 is -3. Modulo follows from a == (a / b) * b + a % b and takes the sign of the dividend.",
  },
  {
    topic: "Truth",
    rule: "Zero is false and anything else is true. There is no boolean type.",
  },
  {
    topic: "Traps",
    rule: "Dividing by zero traps and ends the run. A trap is part of the observable behaviour, so a transformation may not introduce one or remove one.",
  },
  {
    topic: "Evaluation order",
    rule: "Left operand before right, and && and || evaluate the right side only when they have to. Both are observable, because an operand can trap.",
  },
  {
    topic: "Equivalence",
    rule: "Two programs are equivalent when, for the same inputs, they produce the same print trace, finish the same way, and trap the same way. Final variable values are deliberately excluded: the optimizer is supposed to delete variables.",
  },
  {
    topic: "Names",
    rule: "One flat namespace. A name is visible from its declaration to the end of the program, redeclaring is an error, and using an undeclared name is an error.",
  },
  {
    topic: "Literals and comments",
    rule: "Decimal integer literals only; a negative value is unary minus applied to one. Identifiers are letters, digits and underscores, not starting with a digit. Both // and /* */ comments are skipped.",
  },
  {
    topic: "Termination",
    rule: "Execution is capped at 100,000 instructions. A run that hits the cap has proved nothing and is reported as inconclusive rather than as a match.",
  },
];

// --- the eight transformations ------------------------------------------------

export interface Transformation {
  kind: OptimizationKind;
  name: string;
  description: string;
  preconditions: string;
  effects: string;
}

/**
 * Keyed by kind so a transformation added to the engine, and therefore to the
 * shared vocabulary, fails to compile here until it is described.
 * Preconditions and effects are quoted from the transformation classes.
 */
const CATALOG: Record<OptimizationKind, Omit<Transformation, "kind">> = {
  constant_folding: {
    name: "constant folding",
    description: "Evaluates a computation whose operands are all known constants.",
    preconditions: "instruction computes, every operand is a known constant",
    effects: "instruction replaced by a copy of the computed value",
  },
  constant_propagation: {
    name: "constant propagation",
    description: "Replaces a read of a variable that provably holds one constant at that point.",
    preconditions: "instruction reads x, x holds a known constant here",
    effects: "the read of x replaced by the constant",
  },
  copy_propagation: {
    name: "copy propagation",
    description: "Replaces a read of a copy with the variable it was copied from.",
    preconditions: "instruction reads x, x holds the same value as y here",
    effects: "the read of x replaced by y",
  },
  common_subexpression_elimination: {
    name: "common subexpression elimination",
    description: "Reuses a value already computed on every path to this point.",
    preconditions: "instruction computes e, e is already available in y",
    effects: "computation replaced by a copy from y",
  },
  dead_code_elimination: {
    name: "dead code elimination",
    description:
      "Deletes an instruction whose result is never read again. An instruction that can trap stays, since deleting it would remove a trap the program would have hit.",
    preconditions: "instruction defines x, x is not live afterwards, instruction is pure",
    effects: "instruction removed",
  },
  algebraic_simplification: {
    name: "algebraic simplification",
    description:
      "Applies an identity that holds for every value: x + 0, x - 0, x - x, x * 1, x * 0, x / 1.",
    preconditions: "instruction matches an identity that holds for every operand value",
    effects: "instruction replaced by a copy or a constant",
  },
  strength_reduction: {
    name: "strength reduction",
    description: "Rewrites a doubling as an addition. Multiplication by two is the only case.",
    preconditions: "instruction multiplies a variable by two",
    effects: "multiplication replaced by addition of the operand to itself",
  },
  loop_invariant_code_motion: {
    name: "loop-invariant code motion",
    description:
      "Moves a computation that cannot change inside the loop to just before it. It hoists one level, to the innermost enclosing header.",
    preconditions: "instruction is inside a loop, pure, and reads nothing the loop redefines",
    effects: "instruction relocated to immediately before the loop header",
  },
};

/** In the engine's own order, so this page and the decision log agree. */
export const TRANSFORMATIONS: readonly Transformation[] = OPTIMIZATION_TYPES.map((kind) => ({
  kind,
  ...CATALOG[kind],
}));

// --- how a run goes ------------------------------------------------------------

export interface Stage {
  title: string;
  detail: string;
}

export const PIPELINE: readonly Stage[] = [
  {
    title: "Parse and resolve",
    detail:
      "Source becomes an abstract syntax tree, then declarations are checked. An unknown name or a redeclaration fails here with a line and column.",
  },
  {
    title: "Lower to three-address code",
    detail:
      "A fresh temporary for every intermediate value, and nothing folded on the way down. The redundancy that leaves behind is what the optimizer is measured on finding.",
  },
  {
    title: "Analyse",
    detail:
      "A control flow graph, then liveness, reaching definitions, available expressions, constants and copies. The results are asserted as facts rather than read directly.",
  },
  {
    title: "Propose",
    detail:
      "Eight rules query those facts and yield opportunities, each naming a kind and a site. On the llm method a model proposes instead, constrained to the same eight kinds and the same site form, so both go through the identical path from here on.",
  },
  {
    title: "Apply",
    detail:
      "The transformation for that kind rewrites the program, or declines because an earlier rewrite already changed the instruction underneath it. Declining is recorded as a rejection, not an error.",
  },
  {
    title: "Verify",
    detail:
      "Differential testing runs both versions over the same inputs. If the run asked for it, Z3 then tries to turn a pass into a proof.",
  },
  {
    title: "Cost",
    detail:
      "Instruction count, arithmetic operations, temporaries and an estimated execution time, each normalised against the original and weighted, so the original scores 1.0 and any candidate reads as a fraction of it.",
  },
  {
    title: "Accept or reject",
    detail:
      "A candidate is kept only if verification did not refute it and cost went down. The two halves are counted separately, so it is always visible which one turned a proposal away.",
  },
  {
    title: "Repeat, then report",
    detail:
      "The search method decides what to try next until nothing improves, the iteration cap is reached, or the node budget runs out. Every step emits an event, and the trace you watch is the same stream the report is built from.",
  },
];

// --- worked example ------------------------------------------------------------

export interface ExampleRun {
  method: string;
  proposals: number;
  accepted: number;
  cost: number;
  listing: string;
}

export interface WorkedExample {
  source: string;
  lowered: string;
  greedy: ExampleRun;
  astar: ExampleRun;
  applied: readonly OptimizationKind[];
}

/**
 * A real run at seed 0 with the default weights, not an illustration. The two
 * methods are both here because the difference between them is the honest part:
 * every step greedy skipped was verified and correct, and was turned away for
 * not paying off on its own.
 */
export const EXAMPLE: WorkedExample = {
  source: `input n;
int limit = n * 2;
int total = 0;
int i = 0;
while (i < limit) {
  int step = limit - limit;
  total = total + i + step;
  i = i + 1;
}
print(total);`,
  lowered: `  0      t1 = n * 2
  1      limit = t1
  2      total = 0
  3      i = 0
  4  L1:
  5      t2 = i < limit
  6      ifFalse t2 goto L2
  7      t3 = limit - limit
  8      step = t3
  9      t4 = total + i
 10      t5 = t4 + step
 11      total = t5
 12      t6 = i + 1
 13      i = t6
 14      goto L1
 15  L2:
 16      print total`,
  greedy: {
    method: "greedy",
    proposals: 15,
    accepted: 2,
    cost: 0.938,
    listing: `  0      t1 = n + n
  1      limit = t1
  2      total = 0
  3      i = 0
  4  L1:
  5      t2 = i < limit
  6      ifFalse t2 goto L2
  7      t3 = 0
  8      step = t3
  9      t4 = total + i
 10      t5 = t4 + step
 11      total = t5
 12      t6 = i + 1
 13      i = t6
 14      goto L1
 15  L2:
 16      print total`,
  },
  astar: {
    method: "astar",
    proposals: 296,
    accepted: 11,
    cost: 0.691,
    listing: `  0      t1 = n + n
  1      total = 0
  2      i = 0
  3  L1:
  4      t2 = i < t1
  5      ifFalse t2 goto L2
  6      t4 = total + i
  7      total = t4
  8      t6 = i + 1
  9      i = t6
 10      goto L1
 11  L2:
 12      print total`,
  },
  applied: [
    "loop_invariant_code_motion",
    "algebraic_simplification",
    "constant_propagation",
    "algebraic_simplification",
    "dead_code_elimination",
    "copy_propagation",
    "dead_code_elimination",
    "dead_code_elimination",
    "copy_propagation",
    "dead_code_elimination",
    "strength_reduction",
  ],
};

// --- what verification is worth --------------------------------------------------

export interface VerificationChannel {
  title: string;
  method: string;
  summary: string;
  verdicts: readonly Verdict[];
  proves: readonly string[];
  doesNotProve: readonly string[];
}

export const VERIFICATION: readonly VerificationChannel[] = [
  {
    title: "Differential testing",
    method: "differential_testing",
    summary:
      "Runs both versions over the same inputs and compares what they print. Edge values first, because what breaks an optimization is 0, 1, -1 and negatives rather than large numbers, then seeded random values. The same pair always gets the same inputs, so a verdict can be reproduced and a counterexample stays findable.",
    verdicts: ["tests_passed", "counterexample_found"],
    proves: [
      "That two programs differ, by exhibiting the inputs on which they do.",
      "Nothing else. A pass is evidence that no sampled input told them apart.",
    ],
    doesNotProve: [
      "Equivalence. The inputs not sampled were not checked, and there are infinitely many of them.",
      "Anything about a case where either side hit the instruction cap. Those are counted inconclusive and skipped, never counted as a match, so a candidate can pass on fewer cases than were attempted.",
    ],
  },
  {
    title: "SMT check with Z3",
    method: "smt_z3",
    summary:
      "Symbolically executes both programs over the same input variables and collects one terminal state per feasible path: a path condition, the printed expressions, and whether the path trapped. The path conditions partition the input space, so comparing every pair of terminals covers every input. Division is encoded to match the interpreter's truncation exactly rather than using the solver's own.",
    verdicts: ["proven_equivalent", "counterexample_found", "unknown_bounded"],
    proves: [
      "Equivalence over every input, when exploration finished inside its budget. That is a proof, not a sample.",
      "Non-equivalence, with a concrete assignment of the inputs as the witness.",
    ],
    doesNotProve: [
      "Anything beyond the unrolling bound. Loops are unrolled until a budget of 400 steps or 256 states runs out, and hitting either yields unknown_bounded.",
      "Anything about a loop whose trip count comes from an input. Those are unbounded, so a looping program lands on unknown_bounded far more often than not.",
      "Equivalence when the two sides declare different inputs, which is reported as unsupported rather than as a verdict.",
    ],
  },
];

// --- limitations ------------------------------------------------------------------

export interface Limitation {
  title: string;
  detail: string;
}

/**
 * The point of the page. Everything here is a property of the implementation as
 * it stands, not a known bug and not a roadmap item.
 */
export const LIMITATIONS: readonly Limitation[] = [
  {
    title: "Integers only",
    detail:
      "No floating point, strings, arrays, structs or pointers, and no boolean type. There is one type and it is int.",
  },
  {
    title: "Integers do not overflow",
    detail:
      "Values are unbounded, so a computation that would wrap on real hardware does not wrap here. That is what makes the interpreter and the solver comparable, and it means a proof of equivalence is a proof about this language rather than about a 32-bit machine.",
  },
  {
    title: "No functions",
    detail:
      "No definitions, no calls, no parameters, no recursion. A program is one straight sequence of statements, so there is no interprocedural anything to get wrong.",
  },
  {
    title: "One flat scope",
    detail:
      "Blocks do not open a scope and declaring a name twice is an error, even in separate blocks. Lowering is then a one-to-one mapping with no renaming, which keeps the dataflow analyses readable, and it means loop bodies cannot reuse a variable name.",
  },
  {
    title: "No break, continue or early exit",
    detail: "A loop is left only through its condition, and a program ends only by running out.",
  },
  {
    title: "No input at runtime",
    detail:
      "An input declaration names a free variable that is bound before execution. Nothing is read from a terminal or a file, and print is the only way out.",
  },
  {
    title: "The SMT check unrolls loops to a bound",
    detail:
      "Symbolic execution unrolls until a step budget of 400 or a state budget of 256 is reached, then stops and reports unknown_bounded. Read that verdict as no counterexample within the bound, which is weaker than equivalent and is kept distinct from it everywhere in the log for exactly that reason.",
  },
  {
    title: "Testing refutes, it does not prove",
    detail:
      "A tests_passed verdict means no sampled input told the two versions apart. On a program where the solver returns unknown_bounded, sampling is all the evidence there is.",
  },
  {
    title: "The cost gate judges one step at a time",
    detail:
      "A verified, correct transformation that leaves cost unchanged is rejected with no_cost_improvement. Chains that only pay off at the end need a method that can cross a plateau, which is why greedy and astar finish the worked example in different places.",
  },
  {
    title: "Execution time is estimated, not measured",
    detail:
      "The time term assumes ten iterations per loop nesting level and a fixed relative latency per operation. It is a static estimate from the control flow graph. A clock would be noisy and would break the seeded reproducibility the statistics depend on.",
  },
  {
    title: "The catalog is narrow on purpose",
    detail:
      "Strength reduction handles multiplication by two and nothing else. Loop-invariant code motion hoists one level per application. Algebraic simplification knows six identities. Each is small enough to argue about.",
  },
  {
    title: "A search can stop short",
    detail:
      "Runs stop at 200 iterations by default, or earlier under a node budget. Both are caps on effort, so a run that hits one reports where it got to rather than where it could have got to.",
  },
  {
    title: "A disconnect abandons the run",
    detail:
      "The compute service holds nothing: it streams the decision log and forgets it. If the client goes away mid-run the remaining events are lost and the run is recorded as abandoned, which is neither a success nor an engine failure. Reconnecting does not resume it. Starting again with the same seed reproduces it exactly, which is the only recovery there is.",
  },
];
