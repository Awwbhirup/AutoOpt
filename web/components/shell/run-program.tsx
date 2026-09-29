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
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Callout } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { TraceStepList } from "@/components/trace/step-list";
import { readEventStream } from "@/lib/event-stream";
import type { StreamedEvent } from "@/lib/events";
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
  const toast = useToast();

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
        const message = detail?.error ?? "The run could not be started.";
        setProblem(message);
        toast({ title: "Run not started", description: message, tone: "refused" });
        return;
      }

      const ending = await readEventStream(response.body, (arrived) =>
        setEvents((current) => [...current, ...arrived]),
      );

      // The run is in the database now, so the history above this needs to
      // catch up.
      router.refresh();
      if (ending === "run_failed") {
        toast({ title: "Run failed", description: "The trace shows where it stopped.", tone: "refused" });
      } else {
        toast({ title: "Run saved", description: "It is in the history below.", tone: "kept" });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        setProblem(message);
        toast({ title: "Run interrupted", description: message, tone: "refused" });
      }
    } finally {
      setRunning(false);
    }
  }, [programId, method, router, toast]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="method" className="sr-only">
          Search method
        </label>
        <Select
          id="method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          disabled={running}
          className="min-w-44"
        >
          {METHODS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>

        <Button variant="primary" onClick={start} pending={running}>
          Run
        </Button>
        {running ? (
          <span className="text-xs text-muted">Streaming the trace as the engine works.</span>
        ) : null}
      </div>

      {problem ? <Callout tone="refused">{problem}</Callout> : null}

      {events.length > 0 ? (
        <div className="ui-reveal flex flex-col gap-4">
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
