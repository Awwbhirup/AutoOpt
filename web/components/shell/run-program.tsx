"use client";

/**
 * Starting a run from a program page, and watching it happen.
 *
 * The API streams and persists at the same time, so this renders the trace as
 * it arrives and the run is already saved by the time it finishes. Reloading
 * the page shows the same trace read back from the database.
 */

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { streamedEvent, type StreamedEvent } from "@/lib/events";
import { foldTrace } from "@/lib/trace";

const METHODS = [
  { value: "greedy", label: "Greedy" },
  { value: "fixed_pipeline", label: "Fixed pipeline" },
  { value: "astar", label: "A* search" },
  { value: "hill_climbing", label: "Hill climbing" },
  { value: "simulated_annealing", label: "Simulated annealing" },
  { value: "random_baseline", label: "Random baseline" },
];

export function RunProgram({ programId }: { programId: string }) {
  const router = useRouter();
  const [method, setMethod] = useState("greedy");
  const [events, setEvents] = useState<StreamedEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const trace = useMemo(() => foldTrace(events), [events]);

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setEvents([]);
    setProblem(null);
    setRunning(true);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId, method, proveFinal: true }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        setProblem(detail?.error ?? "The run could not be started.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf("\n");
        const arrived: StreamedEvent[] = [];
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            const parsed = streamedEvent.safeParse(JSON.parse(line));
            if (parsed.success) arrived.push(parsed.data);
          }
          newline = buffer.indexOf("\n");
        }
        // One update per chunk rather than per event, so a burst is one render.
        if (arrived.length) setEvents((current) => [...current, ...arrived]);
      }

      // The run is in the database now, so the history above this needs to
      // catch up.
      router.refresh();
    } catch (error) {
      if (!controller.signal.aborted) {
        setProblem(error instanceof Error ? error.message : "Something went wrong.");
      }
    } finally {
      setRunning(false);
    }
  }, [programId, method, router]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="method" className="sr-only">
          Search method
        </label>
        <select
          id="method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          disabled={running}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          {METHODS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={start}
          disabled={running}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {running ? "Running" : "Run"}
        </button>
      </div>

      {problem ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {problem}
        </p>
      ) : null}

      {events.length > 0 ? (
        <div className="flex flex-col gap-4">
          <FinalVerdict summary={trace.summary} />
          <TraceStepList
            steps={trace.steps}
            status={trace.summary.status}
            initialTac={trace.initialTac}
          />
        </div>
      ) : null}
    </section>
  );
}
