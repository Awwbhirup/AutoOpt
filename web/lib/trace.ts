/**
 * The decision log, folded into what a reader of a trace actually needs.
 *
 * The stream is flat and ordered by `seq`, but a reader thinks in steps: the
 * engine spotted something, proposed a rewrite, checked it, priced it, and then
 * kept it or threw it away. Doing that grouping inside the components would
 * mean every component holding a cursor into the array, so it happens once,
 * here, and the components take finished values.
 *
 * Nothing in this file throws. A trace that is still arriving and a trace that
 * died halfway are ordinary cases, not errors: the fold reports how far it got
 * and the interface says so.
 *
 * Field names turn camelCase at this boundary. The wire is snake_case because
 * the engine is Python, and letting that spread into the components would put
 * both conventions in every file that renders one.
 */

import type { Cost, StreamedEvent } from "./events";

type EventOf<K extends StreamedEvent["kind"]> = Extract<StreamedEvent, { kind: K }>;

export type OptimizationType = EventOf<"decision">["optimization_type"];
export type VerificationMethod = EventOf<"verification_result">["method"];
export type VerificationVerdict = EventOf<"verification_result">["verdict"];
export type RejectReason = NonNullable<EventOf<"decision">["reject_reason"]>;
export type ProposalSource = EventOf<"candidate_proposed">["source"];

export interface StepVerification {
  method: VerificationMethod;
  verdict: VerificationVerdict;
  durationMs: number;
  inputsTested: number | null;
  counterexample: Record<string, number> | null;
}

export interface StepCost {
  before: Cost;
  after: Cost;
  improved: boolean;
}

export interface StepOutcome {
  accepted: boolean;
  rejectReason: RejectReason | null;
}

/**
 * One attempt at one site. Everything after `optimizationType` is nullable
 * because a step can be cut short at any point: the stream may still be open,
 * or the run may have died, or the engine may have thrown the opportunity out
 * before proposing anything for it.
 */
export interface TraceStep {
  /** 1-based, for display. Not the same thing as `iteration`. */
  index: number;
  iteration: number;
  optimizationType: OptimizationType;
  site: number | null;
  derivedFrom: string[];
  proposedTac: string[] | null;
  source: ProposalSource | null;
  rationale: string | null;
  verification: StepVerification | null;
  cost: StepCost | null;
  outcome: StepOutcome | null;
  /** The program cost once this step settled. A rejection leaves it alone. */
  runningCost: Cost | null;
}

export type TraceStatus = "streaming" | "converged" | "failed";

export interface TraceFailure {
  message: string;
  errorType: string;
}

export interface TraceSummary {
  status: TraceStatus;
  runId: string | null;
  programId: string | null;
  category: string | null;
  method: string | null;
  costBefore: Cost | null;
  /** On a live trace this is the cost so far, not a final one. */
  costAfter: Cost | null;
  /** Percent off the weighted total. Negative if the program got worse. */
  reductionPercent: number | null;
  /** PASS or FAIL, and null until the engine has actually checked. */
  outputMatch: boolean | null;
  accepted: number;
  rejected: number;
  iterations: number | null;
  failure: TraceFailure | null;
}

export interface Trace {
  summary: TraceSummary;
  steps: TraceStep[];
  initialTac: string[];
  /** Null until the run converges. A failed run never gets one. */
  finalTac: string[] | null;
}

/**
 * Reduction in the weighted total, as a percentage.
 *
 * Null rather than Infinity when the program started free, because there is no
 * honest percentage for that and the panel should print a dash instead.
 */
export function percentReduction(before: number, after: number): number | null {
  if (before === 0) return null;
  return ((before - after) / before) * 100;
}

/**
 * Where two listings differ, as a range in `after`.
 *
 * Matched from both ends rather than line by line, so a rewrite that drops a
 * line reads as one change near the top instead of every line below it looking
 * changed. A pure deletion leaves nothing to point at, hence a `length` of zero
 * and a non-zero `removed`.
 */
export interface LineChange {
  start: number;
  length: number;
  removed: number;
}

export function lineChange(before: string[], after: string[]): LineChange | null {
  const shortest = Math.min(before.length, after.length);

  let prefix = 0;
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1;

  if (prefix === before.length && prefix === after.length) return null;

  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    start: prefix,
    length: after.length - suffix - prefix,
    removed: before.length - suffix - prefix,
  };
}

interface OpenStep {
  step: TraceStep;
  /** Set when the decision lands, so the next event starts a new step. */
  closed: boolean;
}

function newStep(
  index: number,
  iteration: number,
  optimizationType: OptimizationType,
  site: number | null,
  derivedFrom: string[],
): TraceStep {
  return {
    index,
    iteration,
    optimizationType,
    site,
    derivedFrom,
    proposedTac: null,
    source: null,
    rationale: null,
    verification: null,
    cost: null,
    outcome: null,
    runningCost: null,
  };
}

/**
 * Fold a decision log into steps and a summary.
 *
 * Events are taken in the order the service sent them, with no sorting by
 * `seq`: reordering a stream to look tidy would hide the fact that it arrived
 * out of order at all.
 */
export function foldTrace(events: StreamedEvent[]): Trace {
  const steps: TraceStep[] = [];
  let open: OpenStep | null = null;

  let runId: string | null = null;
  let programId: string | null = null;
  let category: string | null = null;
  let method: string | null = null;
  let initialTac: string[] = [];
  let finalTac: string[] | null = null;
  let costBefore: Cost | null = null;
  let running: Cost | null = null;
  let status: TraceStatus = "streaming";
  let outputMatch: boolean | null = null;
  let iterations: number | null = null;
  let failure: TraceFailure | null = null;
  let accepted = 0;
  let rejected = 0;

  function begin(
    iteration: number,
    optimizationType: OptimizationType,
    site: number | null,
    derivedFrom: string[],
  ): OpenStep {
    const step = newStep(steps.length + 1, iteration, optimizationType, site, derivedFrom);
    steps.push(step);
    return { step, closed: false };
  }

  for (const event of events) {
    runId = event.run_id;

    switch (event.kind) {
      case "run_started":
        programId = event.program_id;
        category = event.category;
        method = event.method;
        initialTac = event.initial_tac;
        costBefore = event.initial_cost;
        running = event.initial_cost;
        break;

      case "opportunity_found":
        open = begin(event.iteration, event.optimization_type, event.site, event.derived_from);
        break;

      case "candidate_proposed": {
        // A proposal that follows an opportunity belongs to it. One that does
        // not gets a step of its own rather than being hung off a step that has
        // already been proposed for.
        if (open === null || open.closed || open.step.proposedTac !== null) {
          open = begin(event.iteration, event.optimization_type, event.site, []);
        }
        const step = open.step;
        step.proposedTac = event.proposed_tac;
        step.source = event.source;
        step.rationale = event.rationale;
        break;
      }

      case "verification_result":
        // Nowhere to put a verdict with no step in progress. Dropping it beats
        // inventing a step the engine never reported.
        if (open !== null && !open.closed) {
          open.step.verification = {
            method: event.method,
            verdict: event.verdict,
            durationMs: event.duration_ms,
            inputsTested: event.inputs_tested,
            counterexample: event.counterexample,
          };
        }
        break;

      case "cost_evaluated":
        if (open !== null && !open.closed) {
          open.step.cost = {
            before: event.cost_before,
            after: event.cost_after,
            improved: event.improved,
          };
        }
        break;

      case "decision": {
        if (open === null || open.closed) {
          open = begin(event.iteration, event.optimization_type, null, []);
        }
        const step = open.step;
        step.outcome = { accepted: event.accepted, rejectReason: event.reject_reason };
        if (event.accepted) {
          accepted += 1;
          if (step.cost !== null) running = step.cost.after;
        } else {
          rejected += 1;
        }
        step.runningCost = running;
        open.closed = true;
        break;
      }

      case "run_converged":
        status = "converged";
        finalTac = event.final_tac;
        running = event.final_cost;
        outputMatch = event.output_match;
        iterations = event.iterations;
        break;

      case "run_failed":
        status = "failed";
        failure = { message: event.message, errorType: event.error_type };
        break;

      case "state_expanded":
        // Search bookkeeping. It says nothing about a particular rewrite, so it
        // neither opens a step nor belongs to the one in progress.
        break;
    }
  }

  const reductionPercent =
    costBefore !== null && running !== null
      ? percentReduction(costBefore.weighted_total, running.weighted_total)
      : null;

  return {
    summary: {
      status,
      runId,
      programId,
      category,
      method,
      costBefore,
      costAfter: running,
      reductionPercent,
      // Counted off the decisions on the wire rather than read from
      // run_converged, so a live trace and a finished one are counted the same
      // way and cannot disagree.
      accepted,
      rejected,
      outputMatch,
      iterations,
      failure,
    },
    steps,
    initialTac,
    finalTac,
  };
}

const OPTIMIZATION_LABELS: Record<OptimizationType, string> = {
  constant_folding: "constant folding",
  constant_propagation: "constant propagation",
  copy_propagation: "copy propagation",
  common_subexpression_elimination: "common subexpression elimination",
  dead_code_elimination: "dead code elimination",
  algebraic_simplification: "algebraic simplification",
  strength_reduction: "strength reduction",
  loop_invariant_code_motion: "loop invariant code motion",
};

const VERDICT_LABELS: Record<VerificationVerdict, string> = {
  proven_equivalent: "proven equivalent",
  tests_passed: "tests passed",
  counterexample_found: "counterexample found",
  unknown_bounded: "unknown, bounded",
};

const REJECT_LABELS: Record<RejectReason, string> = {
  verification_failed: "verification failed",
  no_cost_improvement: "no cost improvement",
  not_applicable: "not applicable",
  malformed_proposal: "malformed proposal",
};

const VERIFICATION_METHOD_LABELS: Record<VerificationMethod, string> = {
  differential_testing: "differential testing",
  smt_z3: "Z3",
};

export function optimizationLabel(value: OptimizationType): string {
  return OPTIMIZATION_LABELS[value];
}

export function verdictLabel(value: VerificationVerdict): string {
  return VERDICT_LABELS[value];
}

export function rejectLabel(value: RejectReason): string {
  return REJECT_LABELS[value];
}

export function verificationMethodLabel(value: VerificationMethod): string {
  return VERIFICATION_METHOD_LABELS[value];
}

/**
 * Whether a verdict is one the engine will build on.
 *
 * `unknown_bounded` counts as passing because the engine accepts on it, but it
 * is labelled apart in the interface so nobody reads it as a proof.
 */
export function verdictPassed(value: VerificationVerdict): boolean {
  return value !== "counterexample_found";
}
