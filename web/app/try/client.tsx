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

import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { buttonClass } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/input";
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
                className={buttonClass({ size: "sm", variant: "secondary" })}
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
            className={fieldClass("p-3 font-terminal text-[13px] leading-relaxed")}
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
            className={fieldClass("h-9 flex-1 px-2")}
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
            className={buttonClass({ variant: "primary" })}
          >
            {running ? "Running" : "Optimize"}
          </button>
        </div>

        {problem ? (
          <p className="ui-tone-refused rounded-lg border px-3 py-2 text-sm">
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
