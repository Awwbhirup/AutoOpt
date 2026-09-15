/**
 * The fold, against the three shapes a trace actually turns up in: finished,
 * still arriving, and dead halfway through.
 *
 * Events are built through small helpers that number `seq` themselves, because
 * hand-numbering them made the tests about the numbering rather than about the
 * grouping.
 */

import { describe, expect, it } from "vitest";

import type { Cost, StreamedEvent } from "./events";
import {
  foldTrace,
  lineChange,
  type OptimizationType,
  percentReduction,
  type RejectReason,
  type VerificationVerdict,
  verdictPassed,
} from "./trace";

const RUN = "run_1";

function cost(weighted: number, instructions = 8): Cost {
  return {
    instruction_count: instructions,
    arithmetic_ops: instructions - 2,
    temp_vars: 3,
    execution_time_us: weighted * 2,
    weighted_total: weighted,
  };
}

class Log {
  private seq = 0;
  private iteration = 0;
  readonly events: StreamedEvent[] = [];

  /** run_id and seq, which every event carries and no test cares about. */
  private head() {
    const seq = this.seq;
    this.seq += 1;
    return { run_id: RUN, seq, iteration: this.iteration };
  }

  iterate(n: number): this {
    this.iteration = n;
    return this;
  }

  started(tac: string[], initial: Cost): this {
    this.events.push({
      ...this.head(),
      kind: "run_started",
      program_id: "prog_1",
      category: "arithmetic",
      method: "greedy",
      initial_tac: tac,
      initial_cost: initial,
    });
    return this;
  }

  opportunity(type: OptimizationType, site: number, derivedFrom: string[] = []): this {
    this.events.push({
      ...this.head(),
      kind: "opportunity_found",
      optimization_type: type,
      site,
      derived_from: derivedFrom,
    });
    return this;
  }

  proposal(
    type: OptimizationType,
    site: number,
    tac: string[],
    rationale: string | null = null,
  ): this {
    this.events.push({
      ...this.head(),
      kind: "candidate_proposed",
      optimization_type: type,
      site,
      proposed_tac: tac,
      source: rationale === null ? "rule_based" : "llm",
      rationale,
    });
    return this;
  }

  verified(
    verdict: VerificationVerdict,
    counterexample: Record<string, number> | null = null,
  ): this {
    this.events.push({
      ...this.head(),
      kind: "verification_result",
      method: "differential_testing",
      verdict,
      duration_ms: 12.5,
      inputs_tested: 100,
      counterexample,
    });
    return this;
  }

  priced(before: Cost, after: Cost): this {
    this.events.push({
      ...this.head(),
      kind: "cost_evaluated",
      cost_before: before,
      cost_after: after,
      improved: after.weighted_total < before.weighted_total,
    });
    return this;
  }

  expanded(hash: string): this {
    this.events.push({
      ...this.head(),
      kind: "state_expanded",
      state_hash: hash,
      parent_hash: null,
      g_cost: 1,
      h_estimate: 2,
      frontier_size: 4,
    });
    return this;
  }

  decided(type: OptimizationType, accepted: boolean, reason: RejectReason | null = null): this {
    this.events.push({
      ...this.head(),
      kind: "decision",
      accepted,
      optimization_type: type,
      reject_reason: reason,
    });
    return this;
  }

  converged(tac: string[], final: Cost, outputMatch = true): this {
    this.events.push({
      ...this.head(),
      kind: "run_converged",
      final_tac: tac,
      final_cost: final,
      iterations: this.iteration + 1,
      proposals: 2,
      accepted: 1,
      output_match: outputMatch,
    });
    return this;
  }

  failed(message: string, errorType = "TimeoutError"): this {
    const { run_id, seq } = this.head();
    this.events.push({ kind: "run_failed", run_id, seq, message, error_type: errorType });
    return this;
  }
}

const START = ["t1 = 2 * 3", "t2 = t1 + x", "y = t2"];
const AFTER_FOLD = ["t1 = 6", "t2 = t1 + x", "y = t2"];

/** A run that folded a constant, then had a rewrite rejected, then converged. */
function completed(): Log {
  return new Log()
    .started(START, cost(100, 3))
    .opportunity("constant_folding", 0, ["t1"])
    .proposal("constant_folding", 0, AFTER_FOLD)
    .verified("proven_equivalent")
    .priced(cost(100, 3), cost(80, 3))
    .decided("constant_folding", true)
    .expanded("h1")
    .iterate(1)
    .opportunity("dead_code_elimination", 2)
    .proposal("dead_code_elimination", 2, ["t1 = 6", "t2 = t1 + x"], "y looks unused")
    .verified("counterexample_found", { x: 1 })
    .priced(cost(80, 3), cost(60, 2))
    .decided("dead_code_elimination", false, "verification_failed")
    .converged(AFTER_FOLD, cost(80, 3));
}

describe("a completed run", () => {
  it("groups each opportunity and its outcome into one step", () => {
    const trace = foldTrace(completed().events);

    expect(trace.steps).toHaveLength(2);

    const [folded, dead] = trace.steps;
    expect(folded.index).toBe(1);
    expect(folded.iteration).toBe(0);
    expect(folded.optimizationType).toBe("constant_folding");
    expect(folded.site).toBe(0);
    expect(folded.derivedFrom).toEqual(["t1"]);
    expect(folded.proposedTac).toEqual(AFTER_FOLD);
    expect(folded.source).toBe("rule_based");
    expect(folded.verification?.verdict).toBe("proven_equivalent");
    expect(folded.cost?.improved).toBe(true);
    expect(folded.outcome).toEqual({ accepted: true, rejectReason: null });

    expect(dead.index).toBe(2);
    expect(dead.iteration).toBe(1);
    expect(dead.rationale).toBe("y looks unused");
    expect(dead.source).toBe("llm");
    expect(dead.verification?.counterexample).toEqual({ x: 1 });
    expect(dead.outcome).toEqual({ accepted: false, rejectReason: "verification_failed" });
  });

  it("carries the running cost forward only past an accepted step", () => {
    const trace = foldTrace(completed().events);

    expect(trace.steps[0].runningCost?.weighted_total).toBe(80);
    // The rejected step priced at 60 but was thrown out, so the program is
    // still the 80 the accepted step left behind.
    expect(trace.steps[1].runningCost?.weighted_total).toBe(80);
  });

  it("summarises the run", () => {
    const { summary, initialTac, finalTac } = foldTrace(completed().events);

    expect(summary.status).toBe("converged");
    expect(summary.runId).toBe(RUN);
    expect(summary.programId).toBe("prog_1");
    expect(summary.method).toBe("greedy");
    expect(summary.costBefore?.weighted_total).toBe(100);
    expect(summary.costAfter?.weighted_total).toBe(80);
    expect(summary.reductionPercent).toBe(20);
    expect(summary.outputMatch).toBe(true);
    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.iterations).toBe(2);
    expect(summary.failure).toBeNull();
    expect(initialTac).toEqual(START);
    expect(finalTac).toEqual(AFTER_FOLD);
  });

  it("reports a failed output check without touching the counts", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .opportunity("constant_folding", 0)
      .proposal("constant_folding", 0, AFTER_FOLD)
      .verified("tests_passed")
      .priced(cost(100, 3), cost(80, 3))
      .decided("constant_folding", true)
      .converged(AFTER_FOLD, cost(80, 3), false).events;

    const { summary } = foldTrace(events);
    expect(summary.outputMatch).toBe(false);
    expect(summary.accepted).toBe(1);
  });
});

describe("a trace that is still arriving", () => {
  it("keeps the unfinished step and reports the cost reached so far", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .opportunity("constant_folding", 0)
      .proposal("constant_folding", 0, AFTER_FOLD)
      .verified("proven_equivalent")
      .priced(cost(100, 3), cost(80, 3))
      .decided("constant_folding", true)
      .iterate(1)
      .opportunity("strength_reduction", 1)
      .proposal("strength_reduction", 1, ["t1 = 6", "t2 = t1 + x", "y = t2"]).events;

    const { summary, steps, finalTac } = foldTrace(events);

    expect(summary.status).toBe("streaming");
    expect(steps).toHaveLength(2);
    expect(steps[1].outcome).toBeNull();
    expect(steps[1].verification).toBeNull();
    expect(steps[1].runningCost).toBeNull();
    // The accepted step is banked even though the run has not finished.
    expect(summary.costAfter?.weighted_total).toBe(80);
    expect(summary.reductionPercent).toBe(20);
    expect(summary.outputMatch).toBeNull();
    expect(summary.iterations).toBeNull();
    expect(finalTac).toBeNull();
  });

  it("holds a step open through a verdict that has not been decided on", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .opportunity("copy_propagation", 1)
      .proposal("copy_propagation", 1, AFTER_FOLD)
      .verified("unknown_bounded").events;

    const { steps, summary } = foldTrace(events);
    expect(steps).toHaveLength(1);
    expect(steps[0].verification?.verdict).toBe("unknown_bounded");
    expect(steps[0].outcome).toBeNull();
    expect(summary.accepted).toBe(0);
    expect(summary.rejected).toBe(0);
    expect(summary.costAfter?.weighted_total).toBe(100);
  });

  it("has nothing to summarise before the first event", () => {
    const { summary, steps } = foldTrace([]);
    expect(summary.status).toBe("streaming");
    expect(summary.runId).toBeNull();
    expect(summary.costBefore).toBeNull();
    expect(summary.reductionPercent).toBeNull();
    expect(steps).toEqual([]);
  });
});

describe("a run that died", () => {
  it("reports the failure and keeps the steps that got through", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .opportunity("constant_folding", 0)
      .proposal("constant_folding", 0, AFTER_FOLD)
      .verified("proven_equivalent")
      .priced(cost(100, 3), cost(80, 3))
      .decided("constant_folding", true)
      .iterate(1)
      .opportunity("loop_invariant_code_motion", 2)
      .failed("the solver ran out of time", "SolverTimeout").events;

    const { summary, steps, finalTac } = foldTrace(events);

    expect(summary.status).toBe("failed");
    expect(summary.failure).toEqual({
      message: "the solver ran out of time",
      errorType: "SolverTimeout",
    });
    expect(summary.outputMatch).toBeNull();
    expect(summary.accepted).toBe(1);
    expect(summary.costAfter?.weighted_total).toBe(80);
    expect(finalTac).toBeNull();
    expect(steps).toHaveLength(2);
    expect(steps[1].proposedTac).toBeNull();
    expect(steps[1].outcome).toBeNull();
  });

  it("survives a failure before anything else arrived", () => {
    const { summary, steps } = foldTrace(new Log().failed("the engine would not start").events);
    expect(summary.status).toBe("failed");
    expect(summary.runId).toBe(RUN);
    expect(summary.costBefore).toBeNull();
    expect(steps).toEqual([]);
  });
});

describe("events that do not fit the usual order", () => {
  it("starts a step for a proposal with no opportunity before it", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .proposal("algebraic_simplification", 0, AFTER_FOLD)
      .proposal("strength_reduction", 1, AFTER_FOLD).events;

    const { steps } = foldTrace(events);
    expect(steps).toHaveLength(2);
    expect(steps[0].optimizationType).toBe("algebraic_simplification");
    expect(steps[1].optimizationType).toBe("strength_reduction");
    expect(steps[1].site).toBe(1);
  });

  it("starts a step for a decision with no opportunity before it", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .decided("constant_folding", false, "not_applicable").events;

    const { steps, summary } = foldTrace(events);
    expect(steps).toHaveLength(1);
    expect(steps[0].site).toBeNull();
    expect(steps[0].outcome).toEqual({ accepted: false, rejectReason: "not_applicable" });
    expect(summary.rejected).toBe(1);
  });

  it("drops a verdict that belongs to a step already decided", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .opportunity("constant_folding", 0)
      .decided("constant_folding", false, "not_applicable")
      .verified("proven_equivalent").events;

    const { steps } = foldTrace(events);
    expect(steps).toHaveLength(1);
    expect(steps[0].verification).toBeNull();
  });

  it("drops a price with no step in progress to hang it on", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .priced(cost(100, 3), cost(60, 2))
      .opportunity("constant_folding", 0)
      .decided("constant_folding", true)
      .priced(cost(100, 3), cost(40, 1)).events;

    const { steps, summary } = foldTrace(events);
    expect(steps).toHaveLength(1);
    // Neither the price that arrived before the step opened nor the one that
    // arrived after it was decided belongs to it.
    expect(steps[0].cost).toBeNull();
    // Nothing was priced, so the accepted step banks nothing and the program is
    // still where it started.
    expect(summary.costAfter?.weighted_total).toBe(100);
  });

  it("ignores search bookkeeping", () => {
    const events = new Log()
      .started(START, cost(100, 3))
      .expanded("h1")
      .expanded("h2")
      .opportunity("constant_folding", 0)
      .expanded("h3")
      .proposal("constant_folding", 0, AFTER_FOLD).events;

    const { steps } = foldTrace(events);
    expect(steps).toHaveLength(1);
    expect(steps[0].proposedTac).toEqual(AFTER_FOLD);
  });
});

describe("percentReduction", () => {
  it("measures the drop against the starting cost", () => {
    expect(percentReduction(100, 75)).toBe(25);
    expect(percentReduction(80, 80)).toBe(0);
  });

  it("goes negative when the program got worse", () => {
    expect(percentReduction(100, 120)).toBe(-20);
  });

  it("refuses to divide by a starting cost of zero", () => {
    expect(percentReduction(0, 0)).toBeNull();
  });
});

describe("verdictPassed", () => {
  it("passes a bounded unknown, because the engine builds on one", () => {
    expect(verdictPassed("unknown_bounded")).toBe(true);
    expect(verdictPassed("proven_equivalent")).toBe(true);
    expect(verdictPassed("tests_passed")).toBe(true);
  });

  it("fails only on a counterexample", () => {
    expect(verdictPassed("counterexample_found")).toBe(false);
  });
});

describe("lineChange", () => {
  it("finds a replaced line", () => {
    expect(lineChange(["a", "b", "c"], ["a", "B", "c"])).toEqual({
      start: 1,
      length: 1,
      removed: 1,
    });
  });

  it("finds an inserted line", () => {
    expect(lineChange(["a", "c"], ["a", "b", "c"])).toEqual({ start: 1, length: 1, removed: 0 });
  });

  it("points at the seam where a line was deleted", () => {
    expect(lineChange(["a", "b", "c"], ["a", "c"])).toEqual({ start: 1, length: 0, removed: 1 });
  });

  it("does not spread a deletion over every line below it", () => {
    const before = ["a", "b", "c", "d", "e"];
    const after = ["a", "c", "d", "e"];
    expect(lineChange(before, after)?.length).toBe(0);
    expect(lineChange(before, after)?.start).toBe(1);
  });

  it("reports nothing for identical listings", () => {
    expect(lineChange(["a", "b"], ["a", "b"])).toBeNull();
    expect(lineChange([], [])).toBeNull();
  });
});
