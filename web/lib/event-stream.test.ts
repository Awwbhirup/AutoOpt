import { describe, expect, it } from "vitest";

import { readEventStream } from "./event-stream";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const failed = JSON.stringify({ kind: "run_failed", run_id: "r", seq: 0, message: "no", error_type: "X" });

describe("readEventStream", () => {
  it("reports an interrupted stream instead of leaving the run pending", async () => {
    await expect(readEventStream(streamOf([]), () => undefined)).rejects.toThrow("interrupted");
  });
  it("joins lines split across chunks and reports the last kind", async () => {
    const batches: number[] = [];
    const last = await readEventStream(streamOf([failed.slice(0, 10), `${failed.slice(10)}\n`]), (events) =>
      batches.push(events.length),
    );
    expect(batches).toEqual([1]);
    expect(last).toBe("run_failed");
  });

  it("skips lines that are not JSON or not events, and reads a final line with no newline", async () => {
    const seen: string[] = [];
    const last = await readEventStream(streamOf(["not json\n", '{"kind":"nope"}\n', failed]), (events) =>
      seen.push(...events.map((event) => event.kind)),
    );
    expect(seen).toEqual(["run_failed"]);
    expect(last).toBe("run_failed");
  });
});
