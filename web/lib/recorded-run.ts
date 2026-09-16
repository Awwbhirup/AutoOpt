/**
 * One real run of the engine, recorded, for the landing page to replay.
 *
 * Not a mock and not an illustration. These are the events the engine emitted
 * optimizing conditional_001 with the greedy strategy, in the order it emitted
 * them, and the page folds them with the same foldTrace the run pages use. If
 * the engine's behaviour changes, this file is regenerated and the page changes
 * with it; nothing here is a figure anyone typed in.
 *
 * Regenerate:  python scripts/record_landing_run.py
 *
 * Recorded 2026-09-17 from 4776f2a.
 * Program conditional_001 (conditional), greedy, per-step
 * verification by differential testing, Z3 proof on the final program.
 */

import type { StreamedEvent } from "./events";

/** The source the run started from, as the generator wrote it. */
export const RECORDED_SOURCE = "input in1;\ninput in2;\nint r3 = 0;\nif (in1 >= in2) {\n    r3 = in1 + 0;\n} else {\n    r3 = in1 * 1;\n}\nprint(r3);";

export const RECORDED_PROGRAM_ID = "conditional_001";
export const RECORDED_METHOD = "greedy";

/** Measured, not asserted: 35.9% off the weighted cost model. */
export const RECORDED_REDUCTION = 0.3594;

export const RECORDED_EVENTS: StreamedEvent[] = [
 {
  "run_id": "conditional_001",
  "seq": 1,
  "iteration": 0,
  "kind": "run_started",
  "program_id": "conditional_001",
  "category": "mixed",
  "method": "greedy",
  "initial_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1 + 0",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1 * 1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "initial_cost": {
   "instruction_count": 11,
   "arithmetic_ops": 2,
   "temp_vars": 3,
   "execution_time_us": 13.0,
   "weighted_total": 1.0
  }
 },
 {
  "run_id": "conditional_001",
  "seq": 2,
  "iteration": 0,
  "kind": "opportunity_found",
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "derived_from": [
   "defines(0, r3)",
   "dead_after(r3, 0)",
   "pure(0)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 3,
  "iteration": 0,
  "kind": "candidate_proposed",
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "proposed_tac": [
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1 + 0",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1 * 1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 4,
  "iteration": 0,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 5,
  "iteration": 0,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 10,
   "arithmetic_ops": 2,
   "temp_vars": 3,
   "execution_time_us": 12.0,
   "weighted_total": 1.0
  },
  "cost_after": {
   "instruction_count": 10,
   "arithmetic_ops": 2,
   "temp_vars": 3,
   "execution_time_us": 12.0,
   "weighted_total": 0.955944055944056
  },
  "improved": true
 },
 {
  "run_id": "conditional_001",
  "seq": 6,
  "iteration": 0,
  "kind": "opportunity_found",
  "optimization_type": "algebraic_simplification",
  "site": 3,
  "derived_from": [
   "algebraic(3, add_zero)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 7,
  "iteration": 0,
  "kind": "candidate_proposed",
  "optimization_type": "algebraic_simplification",
  "site": 3,
  "proposed_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1 * 1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 8,
  "iteration": 0,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 9,
  "iteration": 0,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 11,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 13.0,
   "weighted_total": 1.0
  },
  "cost_after": {
   "instruction_count": 11,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 13.0,
   "weighted_total": 0.8500000000000001
  },
  "improved": true
 },
 {
  "run_id": "conditional_001",
  "seq": 10,
  "iteration": 0,
  "kind": "opportunity_found",
  "optimization_type": "algebraic_simplification",
  "site": 7,
  "derived_from": [
   "algebraic(7, mul_one)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 11,
  "iteration": 0,
  "kind": "candidate_proposed",
  "optimization_type": "algebraic_simplification",
  "site": 7,
  "proposed_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1 + 0",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 12,
  "iteration": 0,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 13,
  "iteration": 0,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 11,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 1.0
  },
  "cost_after": {
   "instruction_count": 11,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.8346153846153846
  },
  "improved": true
 },
 {
  "run_id": "conditional_001",
  "seq": 14,
  "iteration": 1,
  "kind": "opportunity_found",
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "derived_from": [
   "defines(0, r3)",
   "dead_after(r3, 0)",
   "pure(0)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 15,
  "iteration": 1,
  "kind": "candidate_proposed",
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "proposed_tac": [
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1 + 0",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 16,
  "iteration": 1,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 17,
  "iteration": 1,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 10,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.8346153846153846
  },
  "cost_after": {
   "instruction_count": 10,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.7905594405594406
  },
  "improved": true
 },
 {
  "run_id": "conditional_001",
  "seq": 18,
  "iteration": 1,
  "kind": "opportunity_found",
  "optimization_type": "algebraic_simplification",
  "site": 3,
  "derived_from": [
   "algebraic(3, add_zero)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 19,
  "iteration": 1,
  "kind": "candidate_proposed",
  "optimization_type": "algebraic_simplification",
  "site": 3,
  "proposed_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 20,
  "iteration": 1,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 21,
  "iteration": 1,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 11,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.8346153846153846
  },
  "cost_after": {
   "instruction_count": 11,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.6846153846153846
  },
  "improved": true
 },
 {
  "run_id": "conditional_001",
  "seq": 22,
  "iteration": 1,
  "kind": "opportunity_found",
  "optimization_type": "copy_propagation",
  "site": 8,
  "derived_from": [
   "reads(8, t3)",
   "copy_of(t3, in1, 8)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 23,
  "iteration": 1,
  "kind": "candidate_proposed",
  "optimization_type": "copy_propagation",
  "site": 8,
  "proposed_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1 + 0",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = in1",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 24,
  "iteration": 1,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 25,
  "iteration": 1,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 11,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.8346153846153846
  },
  "cost_after": {
   "instruction_count": 11,
   "arithmetic_ops": 1,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.8346153846153846
  },
  "improved": false
 },
 {
  "run_id": "conditional_001",
  "seq": 26,
  "iteration": 1,
  "kind": "decision",
  "accepted": false,
  "optimization_type": "copy_propagation",
  "site": null,
  "reject_reason": "no_cost_improvement"
 },
 {
  "run_id": "conditional_001",
  "seq": 27,
  "iteration": 2,
  "kind": "opportunity_found",
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "derived_from": [
   "defines(0, r3)",
   "dead_after(r3, 0)",
   "pure(0)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 28,
  "iteration": 2,
  "kind": "candidate_proposed",
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "proposed_tac": [
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 29,
  "iteration": 2,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 30,
  "iteration": 2,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6846153846153846
  },
  "cost_after": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6405594405594406
  },
  "improved": true
 },
 {
  "run_id": "conditional_001",
  "seq": 31,
  "iteration": 2,
  "kind": "opportunity_found",
  "optimization_type": "copy_propagation",
  "site": 4,
  "derived_from": [
   "reads(4, t2)",
   "copy_of(t2, in1, 4)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 32,
  "iteration": 2,
  "kind": "candidate_proposed",
  "optimization_type": "copy_propagation",
  "site": 4,
  "proposed_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = in1",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 33,
  "iteration": 2,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 34,
  "iteration": 2,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 11,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.6846153846153846
  },
  "cost_after": {
   "instruction_count": 11,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.6846153846153846
  },
  "improved": false
 },
 {
  "run_id": "conditional_001",
  "seq": 35,
  "iteration": 2,
  "kind": "decision",
  "accepted": false,
  "optimization_type": "copy_propagation",
  "site": null,
  "reject_reason": "no_cost_improvement"
 },
 {
  "run_id": "conditional_001",
  "seq": 36,
  "iteration": 2,
  "kind": "opportunity_found",
  "optimization_type": "copy_propagation",
  "site": 8,
  "derived_from": [
   "reads(8, t3)",
   "copy_of(t3, in1, 8)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 37,
  "iteration": 2,
  "kind": "candidate_proposed",
  "optimization_type": "copy_propagation",
  "site": 8,
  "proposed_tac": [
   "r3 = 0",
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = in1",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 38,
  "iteration": 2,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 39,
  "iteration": 2,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 11,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.6846153846153846
  },
  "cost_after": {
   "instruction_count": 11,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 11.0,
   "weighted_total": 0.6846153846153846
  },
  "improved": false
 },
 {
  "run_id": "conditional_001",
  "seq": 40,
  "iteration": 2,
  "kind": "decision",
  "accepted": false,
  "optimization_type": "copy_propagation",
  "site": null,
  "reject_reason": "no_cost_improvement"
 },
 {
  "run_id": "conditional_001",
  "seq": 41,
  "iteration": 3,
  "kind": "opportunity_found",
  "optimization_type": "copy_propagation",
  "site": 3,
  "derived_from": [
   "reads(3, t2)",
   "copy_of(t2, in1, 3)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 42,
  "iteration": 3,
  "kind": "candidate_proposed",
  "optimization_type": "copy_propagation",
  "site": 3,
  "proposed_tac": [
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = in1",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 43,
  "iteration": 3,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 44,
  "iteration": 3,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6405594405594406
  },
  "cost_after": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6405594405594406
  },
  "improved": false
 },
 {
  "run_id": "conditional_001",
  "seq": 45,
  "iteration": 3,
  "kind": "decision",
  "accepted": false,
  "optimization_type": "copy_propagation",
  "site": null,
  "reject_reason": "no_cost_improvement"
 },
 {
  "run_id": "conditional_001",
  "seq": 46,
  "iteration": 3,
  "kind": "opportunity_found",
  "optimization_type": "copy_propagation",
  "site": 7,
  "derived_from": [
   "reads(7, t3)",
   "copy_of(t3, in1, 7)"
  ]
 },
 {
  "run_id": "conditional_001",
  "seq": 47,
  "iteration": 3,
  "kind": "candidate_proposed",
  "optimization_type": "copy_propagation",
  "site": 7,
  "proposed_tac": [
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = in1",
   "L2:",
   "print r3"
  ],
  "source": "rule_based",
  "rationale": null
 },
 {
  "run_id": "conditional_001",
  "seq": 48,
  "iteration": 3,
  "kind": "verification_result",
  "method": "differential_testing",
  "verdict": "tests_passed",
  "duration_ms": 0.0,
  "inputs_tested": 29,
  "counterexample": null
 },
 {
  "run_id": "conditional_001",
  "seq": 49,
  "iteration": 3,
  "kind": "cost_evaluated",
  "cost_before": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6405594405594406
  },
  "cost_after": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6405594405594406
  },
  "improved": false
 },
 {
  "run_id": "conditional_001",
  "seq": 50,
  "iteration": 3,
  "kind": "decision",
  "accepted": false,
  "optimization_type": "copy_propagation",
  "site": null,
  "reject_reason": "no_cost_improvement"
 },
 {
  "run_id": "conditional_001",
  "seq": 51,
  "iteration": 3,
  "kind": "decision",
  "accepted": true,
  "optimization_type": "algebraic_simplification",
  "site": 7,
  "reject_reason": null
 },
 {
  "run_id": "conditional_001",
  "seq": 52,
  "iteration": 3,
  "kind": "decision",
  "accepted": true,
  "optimization_type": "algebraic_simplification",
  "site": 3,
  "reject_reason": null
 },
 {
  "run_id": "conditional_001",
  "seq": 53,
  "iteration": 3,
  "kind": "decision",
  "accepted": true,
  "optimization_type": "dead_code_elimination",
  "site": 0,
  "reject_reason": null
 },
 {
  "run_id": "conditional_001",
  "seq": 54,
  "iteration": 3,
  "kind": "run_converged",
  "final_tac": [
   "t1 = in1 >= in2",
   "ifFalse t1 goto L1",
   "t2 = in1",
   "r3 = t2",
   "goto L2",
   "L1:",
   "t3 = in1",
   "r3 = t3",
   "L2:",
   "print r3"
  ],
  "final_cost": {
   "instruction_count": 10,
   "arithmetic_ops": 0,
   "temp_vars": 3,
   "execution_time_us": 10.0,
   "weighted_total": 0.6405594405594406
  },
  "iterations": 3,
  "proposals": 11,
  "accepted": 3,
  "output_match": true
 }
] as StreamedEvent[];
