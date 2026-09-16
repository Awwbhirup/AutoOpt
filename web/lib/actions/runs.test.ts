/**
 * What has to hold for a run to be worth keeping: the log goes down in the
 * order it arrived, a run that ends badly is closed out as such rather than
 * left running, and a caller who may not start one never gets a row.
 *
 * The events are built through a small log so the tests read as the engine
 * reads. That log numbers its own events from somewhere other than zero, so a
 * recorder that passed the engine's `seq` through to the column cannot pass for
 * one that numbers by arrival.
 */

import { describe, expect, it } from "vitest";

import type { Role } from "../authorize";
import type { Cost, StreamedEvent } from "../events";
import { ServiceError } from "../service";
import { fakePrisma, type RecordedCall } from "../test-support/fake-prisma";
import { RunRecorder, runFailure, startRun } from "./runs";

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
  /** Where the engine's numbering happens to be. Not where the column starts. */
  private seq = 40;
  readonly events: StreamedEvent[] = [];

  /** run_id and the engine's seq, which every event on the wire carries. */
  private head() {
    const seq = this.seq;
    this.seq += 1;
    return { run_id: "engine_1", seq, iteration: 0 };
  }

  started(initial: Cost): this {
    this.events.push({
      ...this.head(),
      kind: "run_started",
      program_id: "prog_1",
      category: "arithmetic",
      method: "greedy",
      initial_tac: ["t0 = 2 + 3"],
      initial_cost: initial,
    });
    return this;
  }

  found(site: number): this {
    this.events.push({
      ...this.head(),
      kind: "opportunity_found",
      optimization_type: "constant_folding",
      site,
      derived_from: [],
    });
    return this;
  }

  proposed(site: number): this {
    this.events.push({
      ...this.head(),
      kind: "candidate_proposed",
      optimization_type: "constant_folding",
      site,
      proposed_tac: ["t0 = 5"],
      source: "rule_based",
      rationale: null,
    });
    return this;
  }

  verified(verdict: "proven_equivalent" | "counterexample_found"): this {
    this.events.push({
      ...this.head(),
      kind: "verification_result",
      method: "smt_z3",
      verdict,
      duration_ms: 4,
      inputs_tested: null,
      counterexample: null,
    });
    return this;
  }

  costed(before: Cost, after: Cost): this {
    this.events.push({
      ...this.head(),
      kind: "cost_evaluated",
      cost_before: before,
      cost_after: after,
      improved: after.weighted_total < before.weighted_total,
    });
    return this;
  }

  decided(accepted: boolean, rejectReason: "verification_failed" | null = null): this {
    this.events.push({
      ...this.head(),
      kind: "decision",
      accepted,
      optimization_type: "constant_folding",
      reject_reason: rejectReason,
    });
    return this;
  }

  converged(final: Cost, outputMatch = true): this {
    this.events.push({
      ...this.head(),
      kind: "run_converged",
      final_tac: ["t0 = 5"],
      final_cost: final,
      iterations: 2,
      proposals: 1,
      accepted: 1,
      output_match: outputMatch,
    });
    return this;
  }

  failed(message: string): this {
    this.events.push({
      kind: "run_failed",
      run_id: "engine_1",
      seq: 0,
      message,
      error_type: "ServiceError",
    });
    return this;
  }
}

/** An accepted rewrite, start to finish. */
function acceptedRun(): Log {
  return new Log()
    .started(cost(20))
    .found(3)
    .proposed(3)
    .verified("proven_equivalent")
    .costed(cost(20), cost(14, 6))
    .decided(true)
    .converged(cost(14, 6));
}

async function feed(recorder: RunRecorder, log: Log): Promise<void> {
  for (const event of log.events) await recorder.record(event);
}

function of(calls: RecordedCall[], model: string, method: string): RecordedCall[] {
  return calls.filter((call) => call.model === model && call.method === method);
}

const STORE = {
  "runEvent.createMany": { count: 1 },
  "transformation.createMany": { count: 1 },
  "run.update": {},
};

const START_INPUT = {
  userId: "user_1",
  programId: "prog_1",
  method: "greedy",
  seed: 0,
  useSmt: false,
  proveFinal: true,
  nodeBudget: null,
};

function storeWith(role: Role | null) {
  return {
    "program.findUnique": {
      id: "prog_1",
      source: "input x;",
      category: "arithmetic",
      project: { workspaceId: "ws_1" },
    },
    "membership.findUnique": role === null ? null : { role },
    "run.create": { id: RUN },
  };
}

describe("startRun", () => {
  it("creates a running row for a member, with the request kept alongside it", async () => {
    const db = fakePrisma(storeWith("MEMBER"));
    const result = await startRun(db.client, START_INPUT);

    expect(result).toEqual({
      ok: true,
      runId: RUN,
      source: "input x;",
      category: "arithmetic",
    });

    const created = of(db.calls, "run", "create");
    expect(created).toHaveLength(1);
    expect(created[0].args.data).toEqual({
      programId: "prog_1",
      startedById: "user_1",
      method: "greedy",
      seed: 0,
      config: {
        useSmt: false,
        proveFinal: true,
        maxIterations: null,
        nodeBudget: null,
        category: "arithmetic",
      },
      status: "RUNNING",
    });
  });

  it("refuses a viewer, and writes nothing for them", async () => {
    const db = fakePrisma(storeWith("VIEWER"));
    const result = await startRun(db.client, START_INPUT);

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(of(db.calls, "run", "create")).toHaveLength(0);
  });

  it("tells a stranger to the workspace the program is not there", async () => {
    const db = fakePrisma(storeWith(null));
    const result = await startRun(db.client, START_INPUT);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(of(db.calls, "run", "create")).toHaveLength(0);
  });

  it("checks the membership of the workspace the program is in", async () => {
    const db = fakePrisma(storeWith("MEMBER"));
    await startRun(db.client, START_INPUT);

    const asked = of(db.calls, "membership", "findUnique");
    expect(asked).toHaveLength(1);
    expect(asked[0].args.where).toEqual({
      userId_workspaceId: { userId: "user_1", workspaceId: "ws_1" },
    });
  });

  it("does not ask about a program that is not there", async () => {
    const db = fakePrisma({ "program.findUnique": null });
    const result = await startRun(db.client, START_INPUT);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(db.calls).toHaveLength(1);
  });
});

describe("RunRecorder", () => {
  it("writes each event as it arrives, numbered in the order it arrived", async () => {
    const db = fakePrisma(STORE);
    const log = acceptedRun();
    await feed(new RunRecorder(db.client, RUN), log);

    const writes = of(db.calls, "runEvent", "createMany");
    // One write per event, not one write at the end.
    expect(writes).toHaveLength(log.events.length);

    const rows = writes.map(
      (call) => (call.args.data as { seq: number; kind: string }[])[0],
    );
    expect(rows.map((row) => row.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows.map((row) => row.kind)).toEqual(log.events.map((event) => event.kind));
  });

  it("numbers a synthesized failure after the events it followed", async () => {
    const db = fakePrisma(STORE);
    // runFailure has no engine seq to carry, so it arrives as a 0. Taking that
    // for the column would collide with run_started on the [runId, seq] unique
    // and skipDuplicates would drop the last thing the run ever said.
    const log = new Log().started(cost(20)).found(1).failed("the engine went away");
    await feed(new RunRecorder(db.client, RUN), log);

    const rows = of(db.calls, "runEvent", "createMany").map(
      (call) => (call.args.data as { seq: number; kind: string }[])[0],
    );
    expect(rows.map((row) => row.seq)).toEqual([0, 1, 2]);
    expect(rows[2].kind).toBe("run_failed");
  });

  it("stores the engine event whole, under the run it belongs to", async () => {
    const db = fakePrisma(STORE);
    const log = new Log().started(cost(20));
    await feed(new RunRecorder(db.client, RUN), log);

    expect(of(db.calls, "runEvent", "createMany")[0].args.data).toEqual([
      { runId: RUN, seq: 0, kind: "run_started", payload: log.events[0] },
    ]);
  });

  it("writes a transformation when a step settles, not when the run ends", async () => {
    const db = fakePrisma(STORE);
    const recorder = new RunRecorder(db.client, RUN);
    const log = acceptedRun();

    // Up to and including the decision, which is the event that closes a step.
    for (const event of log.events.slice(0, 6)) await recorder.record(event);

    const written = of(db.calls, "transformation", "createMany");
    expect(written).toHaveLength(1);
    expect(written[0].args.data).toEqual([
      {
        runId: RUN,
        kind: "constant_folding",
        site: 3,
        costBefore: 20,
        costAfter: 14,
        verificationMethod: "smt_z3",
        verificationVerdict: "proven_equivalent",
        accepted: true,
        rejectReason: null,
      },
    ]);
  });

  it("records why a rejected rewrite was turned down", async () => {
    const db = fakePrisma(STORE);
    const log = new Log()
      .started(cost(20))
      .found(1)
      .proposed(1)
      .verified("counterexample_found")
      .costed(cost(20), cost(18))
      .decided(false, "verification_failed");
    await feed(new RunRecorder(db.client, RUN), log);

    const rows = of(db.calls, "transformation", "createMany")[0].args.data as Record<
      string,
      unknown
    >[];
    expect(rows[0].accepted).toBe(false);
    expect(rows[0].rejectReason).toBe("verification_failed");
  });

  it("writes no transformation for a step nothing was measured on", async () => {
    const db = fakePrisma(STORE);
    // Thrown out before it was priced or verified, so there are no numbers to
    // put in a row that has no nullable columns.
    const log = new Log().started(cost(20)).found(1).decided(false);
    await feed(new RunRecorder(db.client, RUN), log);

    expect(of(db.calls, "transformation", "createMany")).toHaveLength(0);
  });

  it("writes a settled step once, however many settle after it", async () => {
    const db = fakePrisma(STORE);
    const recorder = new RunRecorder(db.client, RUN);
    const log = new Log()
      .started(cost(20))
      .found(3)
      .proposed(3)
      .verified("proven_equivalent")
      .costed(cost(20), cost(14, 6))
      .decided(true)
      .found(5)
      .proposed(5)
      .verified("proven_equivalent")
      .costed(cost(14, 6), cost(11, 5))
      .decided(true)
      .converged(cost(11, 5));

    await feed(recorder, log);
    await recorder.finish();

    const rows = of(db.calls, "transformation", "createMany").flatMap(
      (call) => call.args.data as { site: number }[],
    );
    expect(rows.map((row) => row.site)).toEqual([3, 5]);
  });
});

describe("RunRecorder.finish", () => {
  it("finalizes a converged run with what it cost and whether the output held", async () => {
    const db = fakePrisma(STORE);
    const recorder = new RunRecorder(db.client, RUN);
    await feed(recorder, acceptedRun());

    expect(await recorder.finish()).toBe("SUCCEEDED");

    const update = of(db.calls, "run", "update")[0];
    expect(update.args.where).toEqual({ id: RUN });
    expect(update.args.data).toMatchObject({
      status: "SUCCEEDED",
      costBefore: 20,
      costAfter: 14,
      outputMatch: true,
      finalProof: "proven_equivalent",
      error: null,
    });
  });

  it("takes the final proof from a verdict that belongs to no step", async () => {
    const db = fakePrisma(STORE);
    const recorder = new RunRecorder(db.client, RUN);
    // proveFinal asks Z3 about the whole program once the rewriting has
    // stopped. That verdict lands with no step open, so a proof read off the
    // folded steps would report the rejected rewrite's verdict instead.
    const log = new Log()
      .started(cost(20))
      .found(1)
      .proposed(1)
      .verified("counterexample_found")
      .costed(cost(20), cost(18))
      .decided(false, "verification_failed")
      .verified("proven_equivalent")
      .converged(cost(20));

    await feed(recorder, log);
    expect(await recorder.finish()).toBe("SUCCEEDED");

    const data = of(db.calls, "run", "update")[0].args.data as Record<string, unknown>;
    expect(data.finalProof).toBe("proven_equivalent");
  });

  it("finalizes a run that died as FAILED, with the reason it gave", async () => {
    const db = fakePrisma(STORE);
    const recorder = new RunRecorder(db.client, RUN);
    const log = new Log().started(cost(20)).found(1).failed("the engine went away");
    await feed(recorder, log);

    expect(await recorder.finish()).toBe("FAILED");

    const data = of(db.calls, "run", "update")[0].args.data as Record<string, unknown>;
    expect(data.status).toBe("FAILED");
    expect(data.error).toBe("the engine went away");
  });

  it("finalizes a stream that just stopped as ABANDONED", async () => {
    const db = fakePrisma(STORE);
    const recorder = new RunRecorder(db.client, RUN);
    // What a client disconnect leaves behind: events, then nothing.
    await feed(recorder, new Log().started(cost(20)).found(1).proposed(1));

    expect(await recorder.finish()).toBe("ABANDONED");

    const data = of(db.calls, "run", "update")[0].args.data as Record<string, unknown>;
    expect(data.status).toBe("ABANDONED");
    expect(data.error).toBe("the stream ended before the run converged");
  });

  it("finalizes a run nothing ever arrived for", async () => {
    const db = fakePrisma(STORE);
    const status = await new RunRecorder(db.client, RUN).finish();

    expect(status).toBe("ABANDONED");
    expect(of(db.calls, "run", "update")).toHaveLength(1);
  });
});

describe("runFailure", () => {
  it("says what went wrong when the failure came from the service", () => {
    const event = runFailure(RUN, new ServiceError("the compute service refused the run"));

    expect(event).toEqual({
      kind: "run_failed",
      run_id: RUN,
      seq: 0,
      message: "the compute service refused the run",
      error_type: "ServiceError",
    });
  });

  it("does not repeat an error it cannot vouch for", () => {
    const event = runFailure(RUN, new Error("connect ECONNREFUSED 10.0.0.4:5432"));

    expect(event.message).toBe("the run could not be completed");
    expect(event.error_type).toBe("Error");
  });
});
