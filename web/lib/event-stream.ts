/**
 * Reads a streamed decision log in the browser: NDJSON off a fetch body,
 * parsed and handed over one batch per network chunk, so a burst of events is
 * one render rather than thirty. Resolves with the last event's kind, which
 * says how the run ended.
 */

import { streamedEvent, type StreamedEvent } from "./events";

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onBatch: (events: StreamedEvent[]) => void,
): Promise<StreamedEvent["kind"] | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: StreamedEvent["kind"] | null = null;

  const take = (line: string, into: StreamedEvent[]) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return;
    }
    const parsed = streamedEvent.safeParse(raw);
    if (parsed.success) {
      into.push(parsed.data);
      last = parsed.data.kind;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const arrived: StreamedEvent[] = [];
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      take(buffer.slice(0, newline), arrived);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (arrived.length) onBatch(arrived);
  }
  const tail: StreamedEvent[] = [];
  take(buffer, tail);
  if (tail.length) onBatch(tail);
  return last;
}
