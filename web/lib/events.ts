/**
 * The decision log, as this tier understands it.
 *
 * These mirror the engine's event models. Mirroring is a liability, so it is
 * checked rather than trusted: the compute service publishes its vocabulary at
 * `/schema` and a test compares these lists against it. Add a transformation to
 * the engine and that test fails until this file knows about it, which is the
 * only reason it is acceptable to restate them here at all.
 *
 * Parsing is strict. An event that does not match is a signal that the two
 * sides have diverged, and treating it as "probably fine" is how a trace ends
 * up quietly missing steps.
 */

import { z } from "zod";

export const OPTIMIZATION_TYPES = [
  "constant_folding",
  "constant_propagation",
  "copy_propagation",
  "common_subexpression_elimination",
  "dead_code_elimination",
  "algebraic_simplification",
  "strength_reduction",
  "loop_invariant_code_motion",
] as const;

export const VERIFICATION_METHODS = ["differential_testing", "smt_z3"] as const;

export const VERIFICATION_VERDICTS = [
  "proven_equivalent",
  "tests_passed",
  "counterexample_found",
  // Z3 proves equivalence only up to the unrolling bound on a program with a
  // loop. Reported honestly rather than folded into a pass.
  "unknown_bounded",
] as const;

export const REJECT_REASONS = [
  "verification_failed",
  "no_cost_improvement",
  "not_applicable",
  "malformed_proposal",
] as const;

export const optimizationType = z.enum(OPTIMIZATION_TYPES);
export const verificationMethod = z.enum(VERIFICATION_METHODS);
export const verificationVerdict = z.enum(VERIFICATION_VERDICTS);
export const rejectReason = z.enum(REJECT_REASONS);

export const cost = z.object({
  instruction_count: z.number().int(),
  arithmetic_ops: z.number().int(),
  temp_vars: z.number().int(),
  execution_time_us: z.number(),
  weighted_total: z.number(),
});

/** Carried by every event: which run, and where in it. */
const base = {
  run_id: z.string(),
  seq: z.number().int(),
  iteration: z.number().int(),
};

export const runStarted = z.object({
  ...base,
  kind: z.literal("run_started"),
  program_id: z.string(),
  category: z.string(),
  method: z.string(),
  initial_tac: z.array(z.string()),
  initial_cost: cost,
});

export const opportunityFound = z.object({
  ...base,
  kind: z.literal("opportunity_found"),
  optimization_type: optimizationType,
  site: z.number().int(),
  derived_from: z.array(z.string()).default([]),
});

export const candidateProposed = z.object({
  ...base,
  kind: z.literal("candidate_proposed"),
  optimization_type: optimizationType,
  site: z.number().int(),
  proposed_tac: z.array(z.string()),
  source: z.enum(["rule_based", "llm"]),
  rationale: z.string().nullable().default(null),
});

export const verificationResult = z.object({
  ...base,
  kind: z.literal("verification_result"),
  method: verificationMethod,
  verdict: verificationVerdict,
  duration_ms: z.number(),
  inputs_tested: z.number().int().nullable().default(null),
  counterexample: z.record(z.string(), z.number().int()).nullable().default(null),
});

export const costEvaluated = z.object({
  ...base,
  kind: z.literal("cost_evaluated"),
  cost_before: cost,
  cost_after: cost,
  improved: z.boolean(),
});

export const decision = z.object({
  ...base,
  kind: z.literal("decision"),
  accepted: z.boolean(),
  optimization_type: optimizationType,
  reject_reason: rejectReason.nullable().default(null),
});

export const stateExpanded = z.object({
  ...base,
  kind: z.literal("state_expanded"),
  state_hash: z.string(),
  parent_hash: z.string().nullable(),
  g_cost: z.number(),
  h_estimate: z.number(),
  frontier_size: z.number().int(),
});

export const runConverged = z.object({
  ...base,
  kind: z.literal("run_converged"),
  final_tac: z.array(z.string()),
  final_cost: cost,
  iterations: z.number().int(),
  proposals: z.number().int(),
  accepted: z.number().int(),
  output_match: z.boolean(),
});

/**
 * Not an engine event. The service emits it when a run dies after the response
 * has already begun, at which point the status code is spent and the stream is
 * the only thing left that can carry the news.
 */
export const runFailed = z.object({
  kind: z.literal("run_failed"),
  run_id: z.string(),
  seq: z.number().int(),
  message: z.string(),
  error_type: z.string(),
});

export const engineEvent = z.discriminatedUnion("kind", [
  runStarted,
  opportunityFound,
  candidateProposed,
  verificationResult,
  costEvaluated,
  decision,
  stateExpanded,
  runConverged,
]);

export const streamedEvent = z.discriminatedUnion("kind", [
  runStarted,
  opportunityFound,
  candidateProposed,
  verificationResult,
  costEvaluated,
  decision,
  stateExpanded,
  runConverged,
  runFailed,
]);

export type Cost = z.infer<typeof cost>;
export type EngineEvent = z.infer<typeof engineEvent>;
export type RunFailed = z.infer<typeof runFailed>;
export type StreamedEvent = z.infer<typeof streamedEvent>;

/** Every `kind` this tier can parse. Compared against `/schema` in the tests. */
export const EVENT_KINDS = [
  "run_started",
  "opportunity_found",
  "candidate_proposed",
  "verification_result",
  "cost_evaluated",
  "decision",
  "state_expanded",
  "run_converged",
  "run_failed",
] as const;

export function isTerminal(event: StreamedEvent): boolean {
  return event.kind === "run_converged" || event.kind === "run_failed";
}
