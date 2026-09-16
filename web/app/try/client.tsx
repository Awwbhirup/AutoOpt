"use client";

/**
 * The interactive half of the page.
 *
 * Events are applied as they arrive rather than collected and rendered at the
 * end. The fold is a pure function over everything received so far, so the
 * component holds a list of events and derives the view from it, which keeps
 * the streaming case and the finished case the same code path.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { TraceStepList } from "@/components/trace/step-list";
import { FinalVerdict } from "@/components/trace/final-verdict";
import { streamedEvent, type StreamedEvent } from "@/lib/events";
import { foldTrace } from "@/lib/trace";

interface Sample {
  name: string;
  note: string;
  source: string;
}

const METHODS = [
  { value: "greedy", label: "Greedy" },
  { value: "fixed_pipeline", label: "Fixed pipeline" },
  { value: "astar", label: "A* search" },
  { value: "hill_climbing", label: "Hill climbing" },
  { value: "simulated_annealing", label: "Simulated annealing" },
  { value: "random_baseline", label: "Random baseline" },
];

export function TryItClient({ samples }: { samples: Sample[] }) {
  const [source, setSource] = useState(samples[0].source);
  const [method, setMethod] = useState("greedy");
  const [events, setEvents] = useState<StreamedEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const trace = useMemo(() => foldTrace(events), [events]);

  const run = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setEvents([]);
    setProblem(null);
    setRunning(true);

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, method, proveFinal: true }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setProblem("The run could not be started.");
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
        // One update per chunk rather than per event, so a burst of events is
        // one render instead of thirty.
        if (arrived.length) setEvents((current) => [...current, ...arrived]);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setProblem(error instanceof Error ? error.message : "Something went wrong.");
      }
    } finally {
      setRunning(false);
    }
  }, [source, method]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {samples.map((sample) => (
              <button
                key={sample.name}
                type="button"
                onClick={() => {
                  setSource(sample.source);
                  setEvents([]);
                }}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                title={sample.note}
              >
                {sample.name}
              </button>
            ))}
          </div>

          <label htmlFor="source" className="sr-only">
            Program source
          </label>
          <textarea
            id="source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            rows={16}
            className="w-full rounded border border-zinc-300 bg-white p-3 font-mono text-[13px] leading-relaxed text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="method" className="sr-only">
            Search method
          </label>
          <select
            id="method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {METHODS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={run}
            disabled={running || !source.trim()}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {running ? "Running" : "Optimize"}
          </button>
        </div>

        {problem ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {problem}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {events.length > 0 ? <FinalVerdict summary={trace.summary} /> : null}
        <TraceStepList
          steps={trace.steps}
          status={trace.summary.status}
          initialTac={events.length > 0 ? trace.initialTac : null}
        />
      </div>
    </div>
  );
}
