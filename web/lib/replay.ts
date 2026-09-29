/**
 * A stored run's events, parsed back into the stream vocabulary.
 *
 * Stored payloads were parsed once on the way in, so one that no longer parses
 * means the engine vocabulary has moved under it. Counted and reported rather
 * than thrown, so a few unreadable rows do not take the trace down with them.
 */

import { streamedEvent, type StreamedEvent } from "./events";

export function replayEvents(rows: readonly { payload: unknown }[]): {
  events: StreamedEvent[];
  unreadable: number;
} {
  const events: StreamedEvent[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const parsed = streamedEvent.safeParse(row.payload);
    if (parsed.success) events.push(parsed.data);
    else unreadable += 1;
  }
  return { events, unreadable };
}
