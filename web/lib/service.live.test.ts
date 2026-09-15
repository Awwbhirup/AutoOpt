/**
 * Checked against the real compute service, not a stub.
 *
 * The event definitions in events.ts restate the engine's. Restating anything
 * is a liability, and the only thing that makes it acceptable is this: the
 * service publishes its vocabulary and these tests fail the moment the two
 * disagree. Add a transformation to the engine and this goes red until this
 * tier knows about it.
 *
 * Skipped when the service is not running, so a normal `npm test` does not
 * depend on Python being installed. Run it with the service up:
 *
 *     make serve            # in one terminal
 *     npm test              # in another
 */

import { beforeAll, describe, expect, it } from "vitest";

import { EVENT_KINDS, OPTIMIZATION_TYPES, REJECT_REASONS, VERIFICATION_METHODS, VERIFICATION_VERDICTS } from "./events";
import { methods, optimize, vocabulary } from "./service";

const SERVICE = process.env.AUTOOPT_SERVICE_URL ?? "http://127.0.0.1:8000";

const SOURCE = `
input x;
int a = 2 + 3;
int b = x + a;
int c = x + a;
int d = c * 1;
print(b);
print(d);
`;

let reachable = false;

beforeAll(async () => {
  process.env.AUTOOPT_SERVICE_URL = SERVICE;
  try {
    const response = await fetch(`${SERVICE}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    reachable = response.ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    // Loud, because a drift guard that silently does not run is worse than no
    // drift guard: it reports green while checking nothing.
    console.warn(
      `\n  compute service not reachable at ${SERVICE}; drift checks skipped.` +
        `\n  start it with: make serve\n`,
    );
  }
});

describe.runIf(!process.env.SKIP_LIVE)("against the running compute service", () => {
  it("agrees about the event kinds", async (ctx) => {
    if (!reachable) ctx.skip();
    const published = await vocabulary();
    expect([...EVENT_KINDS].sort()).toEqual([...published.event_kinds].sort());
  });

  it("agrees about the transformation catalog", async (ctx) => {
    if (!reachable) ctx.skip();
    const published = await vocabulary();
    expect([...OPTIMIZATION_TYPES].sort()).toEqual([...published.optimization_types].sort());
  });

  it("agrees about verification methods and verdicts", async (ctx) => {
    if (!reachable) ctx.skip();
    const published = await vocabulary();
    expect([...VERIFICATION_METHODS].sort()).toEqual([...published.verification_methods].sort());
    expect([...VERIFICATION_VERDICTS].sort()).toEqual([...published.verification_verdicts].sort());
  });

  it("agrees about reject reasons", async (ctx) => {
    if (!reachable) ctx.skip();
    const published = await vocabulary();
    expect([...REJECT_REASONS].sort()).toEqual([...published.reject_reasons].sort());
  });

  it("parses a real run end to end", async (ctx) => {
    if (!reachable) ctx.skip();
    const events = [];
    for await (const event of optimize({ source: SOURCE, method: "greedy" })) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(5);
    expect(events[0].kind).toBe("run_started");

    const last = events[events.length - 1];
    expect(last.kind).toBe("run_converged");
    if (last.kind === "run_converged") {
      expect(last.output_match).toBe(true);
    }
  });

  it("reads a parse failure as the last line rather than throwing", async (ctx) => {
    if (!reachable) ctx.skip();
    const events = [];
    for await (const event of optimize({ source: "input x;\nthis is not minilang;\n" })) {
      events.push(event);
    }

    const last = events[events.length - 1];
    expect(last.kind).toBe("run_failed");
  });

  it("lists the methods, with the llm arms marked", async (ctx) => {
    if (!reachable) ctx.skip();
    const available = await methods();
    expect(available.length).toBeGreaterThan(1);
    expect(available.some((entry) => entry.kind === "llm")).toBe(true);
  });
});
