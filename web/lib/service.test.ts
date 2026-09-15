/**
 * The client, against a stub server.
 *
 * Line splitting gets most of the attention because chunk boundaries fall
 * wherever the network puts them, which is regularly mid-object, and a splitter
 * that assumes otherwise works perfectly until it is used over a real
 * connection.
 *
 * The drift test against the real compute service lives in service.live.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { optimize, readLines, ServiceError } from "./service";

const RUN_STARTED = {
  kind: "run_started",
  run_id: "r1",
  seq: 1,
  iteration: 0,
  program_id: "p1",
  category: "mixed",
  method: "greedy",
  initial_tac: ["t1 = 2 + 3"],
  initial_cost: {
    instruction_count: 1,
    arithmetic_ops: 1,
    temp_vars: 1,
    execution_time_us: 1,
    weighted_total: 1,
  },
};

const RUN_CONVERGED = {
  kind: "run_converged",
  run_id: "r1",
  seq: 2,
  iteration: 1,
  final_tac: ["t1 = 5"],
  final_cost: {
    instruction_count: 1,
    arithmetic_ops: 0,
    temp_vars: 1,
    execution_time_us: 1,
    weighted_total: 0.5,
  },
  iterations: 1,
  proposals: 1,
  accepted: 1,
  output_match: true,
};

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
}

function respondWith(chunks: string[], init: ResponseInit = {}) {
  return vi.fn(async () => new Response(streamOf(chunks), { status: 200, ...init }));
}

beforeEach(() => {
  process.env.AUTOOPT_SERVICE_URL = "http://service.invalid";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("splitting the stream into lines", () => {
  it("reads whole lines", async () => {
    const lines = await collect(readLines(streamOf(["a\nb\nc\n"])));
    expect(lines).toEqual(["a", "b", "c"]);
  });

  it("joins an object split across chunks", async () => {
    // The case that matters: the network cut this JSON object in half.
    const lines = await collect(readLines(streamOf(['{"kind":"run', '_started"}\n'])));
    expect(lines).toEqual(['{"kind":"run_started"}']);
  });

  it("splits several lines arriving in one chunk", async () => {
    const lines = await collect(readLines(streamOf(["a\nb\nc\nd\n"])));
    expect(lines).toEqual(["a", "b", "c", "d"]);
  });

  it("yields a final line with no trailing newline", async () => {
    const lines = await collect(readLines(streamOf(["a\nb"])));
    expect(lines).toEqual(["a", "b"]);
  });

  it("ignores blank lines", async () => {
    const lines = await collect(readLines(streamOf(["a\n\n\nb\n"])));
    expect(lines).toEqual(["a", "b"]);
  });

  it("handles a multi-byte character split across chunks", async () => {
    // The decoder is told the stream continues, so a half-arrived character is
    // held back rather than turned into a replacement character.
    const text = '{"rationale":"café"}';
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text + "\n");

    // Cut inside the two-byte sequence, not merely next to it. Derived rather
    // than written as a constant, so the split stays mid-character if the
    // string above is ever edited.
    const cut = encoder.encode(text.slice(0, text.indexOf("é"))).length + 1;
    expect(bytes[cut] & 0b1100_0000).toBe(0b1000_0000); // a continuation byte

    const split = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const lines = await collect(readLines(split));
    expect(lines).toEqual([text]);
  });
});

describe("parsing events", () => {
  it("yields the events in order", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith([JSON.stringify(RUN_STARTED) + "\n", JSON.stringify(RUN_CONVERGED) + "\n"]),
    );

    const events = await collect(optimize({ source: "input x;" }));
    expect(events.map((event) => event.kind)).toEqual(["run_started", "run_converged"]);
  });

  it("yields before the stream is finished", async () => {
    // Buffering would make this collect everything first, which is the whole
    // thing this client exists to avoid.
    const encoder = new TextEncoder();
    let releaseSecond: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify(RUN_STARTED) + "\n"));
        await held;
        controller.enqueue(encoder.encode(JSON.stringify(RUN_CONVERGED) + "\n"));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const iterator = optimize({ source: "input x;" })[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value?.kind).toBe("run_started");

    releaseSecond?.();
    const second = await iterator.next();
    expect(second.value?.kind).toBe("run_converged");
  });

  it("surfaces a failure line as an event rather than throwing", async () => {
    const failed = {
      kind: "run_failed",
      run_id: "r1",
      seq: 1,
      message: "expected '=' in assignment",
      error_type: "ParseError",
    };
    vi.stubGlobal("fetch", respondWith([JSON.stringify(failed) + "\n"]));

    const events = await collect(optimize({ source: "bad" }));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("run_failed");
  });
});

describe("refusing what it does not understand", () => {
  it("throws on a line that is not JSON", async () => {
    vi.stubGlobal("fetch", respondWith(["not json at all\n"]));
    await expect(collect(optimize({ source: "x" }))).rejects.toThrow(ServiceError);
  });

  it("throws on an event kind it has never heard of", async () => {
    // Means this tier and the engine disagree about the contract. Carrying on
    // would drop steps from a trace while appearing to work.
    vi.stubGlobal("fetch", respondWith(['{"kind":"something_new","run_id":"r","seq":1}\n']));
    await expect(collect(optimize({ source: "x" }))).rejects.toThrow(/unrecognised event/);
  });

  it("throws on a known kind with the wrong shape", async () => {
    const broken = { ...RUN_STARTED, initial_cost: { weighted_total: "not a number" } };
    vi.stubGlobal("fetch", respondWith([JSON.stringify(broken) + "\n"]));
    await expect(collect(optimize({ source: "x" }))).rejects.toThrow(/unrecognised event/);
  });

  it("reports a refusal that came with a status code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"detail":"unknown method"}', { status: 422 })),
    );
    await expect(collect(optimize({ source: "x", method: "nope" }))).rejects.toThrow(
      /unknown method/,
    );
  });

  it("complains when the service address is not configured", async () => {
    delete process.env.AUTOOPT_SERVICE_URL;
    await expect(collect(optimize({ source: "x" }))).rejects.toThrow(/AUTOOPT_SERVICE_URL/);
  });
});
