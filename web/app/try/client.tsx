"use client";

/**
 * The playground. The editor is analysed as you type (TAC, flow graph and
 * dataflow facts from the engine, debounced and cancelled when superseded),
 * and a run streams its decision trace, then shows the listing before and
 * after as a diff. The program and method live in the URL hash, so the
 * address bar is always a link to what is on screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { EngineOffline } from "@/components/app/engine-offline";
import { CfgGraph } from "@/components/app/playground/cfg-graph";
import { DataflowTable } from "@/components/app/playground/dataflow-table";
import { DiffView } from "@/components/app/playground/diff-view";
import { MiniLangEditor, type EditorDiagnostic } from "@/components/app/playground/editor";
import { TacView } from "@/components/app/playground/tac-view";
import type { Analysis } from "@/components/app/playground/types";
import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Callout, Panel } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { AnalyzeResponse } from "@/app/api/analyze/route";
import { cx } from "@/lib/cx";
import type { ServiceProblem } from "@/lib/service-errors";
import { readEventStream } from "@/lib/event-stream";
import type { StreamedEvent } from "@/lib/events";
import { methodLabel, RULE_METHODS } from "@/lib/methods";
import { decodeState, encodeState, MAX_SHARED_SOURCE } from "@/lib/playground/url-state";
import { foldTrace } from "@/lib/trace";

interface Sample {
  name: string;
  note: string;
  source: string;
}

const ANALYZE_AFTER_MS = 250;

const PROBLEM_LABEL: Record<ServiceProblem, string> = {
  busy: "engine busy",
  too_large: "too large",
  timeout: "timed out",
  offline: "engine offline",
  refused: "not analysed",
  failed: "not analysed",
};
const HASH_AFTER_MS = 600;

type AnalysisState =
  | { status: "idle" | "loading" }
  | { status: "ok"; result: Analysis }
  | { status: "invalid"; diagnostic: Diagnostic; last: Analysis | null }
  | { status: "unavailable"; problem: ServiceProblem; message: string };

type Diagnostic = Extract<AnalyzeResponse, { status: "invalid" }>["diagnostic"] & EditorDiagnostic;

type Tab = "graph" | "tac" | "dataflow" | "trace" | "diff";

// The hash as the page arrived with it, read once: typing rewrites the hash
// and must not count as arriving again.
let arrivalHash: string | null = null;
const noSubscription = () => () => {};
const readArrivalHash = () => (arrivalHash ??= window.location.hash);
const noHashOnServer = () => null;

/**
 * Keyed on the arrival hash so a shared link's program is the initial state,
 * not an update: the server renders the first sample, the client remounts
 * with the shared one if there is one.
 */
export function TryItClient({ samples }: { samples: Sample[] }) {
  const hash = useSyncExternalStore(noSubscription, readArrivalHash, noHashOnServer);
  const shared = hash === null ? null : decodeState(hash);
  return (
    <Playground
      key={shared === null ? "sample" : "shared"}
      samples={samples}
      initialSource={shared?.source ?? samples[0].source}
      initialMethod={shared?.method ?? "greedy"}
    />
  );
}

function Playground({
  samples,
  initialSource,
  initialMethod,
}: {
  samples: Sample[];
  initialSource: string;
  initialMethod: string;
}) {
  const toast = useToast();
  const [source, setSource] = useState(initialSource);
  const [method, setMethod] = useState(initialMethod);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("graph");
  const [events, setEvents] = useState<StreamedEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const runAbort = useRef<AbortController | null>(null);

  const trace = useMemo(() => foldTrace(events), [events]);

  // Keep the address bar pointing at what is on screen.
  useEffect(() => {
    const timer = setTimeout(() => {
      history.replaceState(null, "", `#${encodeState({ source, method })}`);
    }, HASH_AFTER_MS);
    return () => clearTimeout(timer);
  }, [source, method]);

  // Live analysis, newest request wins.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!source.trim()) {
        setAnalysis({ status: "idle" });
        return;
      }
      setAnalysis((current) => (current.status === "idle" ? { status: "loading" } : current));
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source }),
          signal: controller.signal,
        });
        const answer = (await response.json()) as AnalyzeResponse;
        if (controller.signal.aborted) return;
        setAnalysis((current) => {
          if (answer.status === "ok") return { status: "ok", result: answer.result };
          if (answer.status === "invalid") {
            const last = current.status === "ok" ? current.result : current.status === "invalid" ? current.last : null;
            return { status: "invalid", diagnostic: answer.diagnostic, last };
          }
          return { status: "unavailable", problem: answer.problem, message: answer.message };
        });
      } catch {
        if (!controller.signal.aborted) {
          setAnalysis({ status: "unavailable", problem: "offline", message: "The analysis could not be reached." });
        }
      }
    }, ANALYZE_AFTER_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source]);

  const run = useCallback(async () => {
    runAbort.current?.abort();
    const controller = new AbortController();
    runAbort.current = controller;
    setEvents([]);
    setProblem(null);
    setRunning(true);
    setTab("trace");

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
      const ending = await readEventStream(response.body, (arrived) =>
        setEvents((current) => [...current, ...arrived]),
      );
      if (ending === "run_converged") setTab("diff");
    } catch (error) {
      if (!controller.signal.aborted) {
        setProblem(error instanceof Error ? error.message : "Something went wrong.");
      }
    } finally {
      setRunning(false);
    }
  }, [source, method]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeState({ source, method })}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "It opens this program with this method.", tone: "kept" });
    } catch {
      toast({ title: "Could not copy", description: "The address bar has the link.", tone: "refused" });
    }
  }, [source, method, toast]);

  const shown = analysis.status === "ok" ? analysis.result : analysis.status === "invalid" ? analysis.last : null;
  const diagnostic = analysis.status === "invalid" ? analysis.diagnostic : null;
  const finished = trace.summary.status === "converged" && trace.finalTac !== null;

  const status =
    analysis.status === "ok" ? (
      <Badge tone="kept" mark="+">
        {analysis.result.blocks.length} blocks, {analysis.result.tac.length} TAC lines
      </Badge>
    ) : analysis.status === "invalid" ? (
      <Badge tone="refused" mark="x">
        {analysis.diagnostic.kind} error, line {analysis.diagnostic.line}
      </Badge>
    ) : analysis.status === "unavailable" ? (
      <Badge tone="caution" mark="-">
        {PROBLEM_LABEL[analysis.problem]}
      </Badge>
    ) : (
      <Badge tone="neutral" mark=".">
        {source.trim() ? "analysing" : "empty program"}
      </Badge>
    );

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
        <Panel title="Program" aside={status} bodyClassName="flex flex-col">
          <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
            {samples.map((sample) => (
              <button
                key={sample.name}
                type="button"
                title={sample.note}
                onClick={() => {
                  runAbort.current?.abort();
                  setSource(sample.source);
                  setEvents([]);
                  setProblem(null);
                  setSelected(null);
                  setTab("graph");
                }}
                className={cx(
                  "ui-focus rounded-md border px-2 py-1 text-xs transition-colors",
                  source === sample.source
                    ? "border-ramp-2 bg-ramp-2/10 text-foreground"
                    : "border-line text-foreground/75 hover:border-foreground/25 hover:text-foreground",
                )}
              >
                {sample.name}
              </button>
            ))}
          </div>
          <div className="h-[24rem] lg:h-[28rem]">
            <MiniLangEditor
              value={source}
              onChange={(next) => {
                runAbort.current?.abort();
                setSource(next.slice(0, MAX_SHARED_SOURCE));
                setEvents([]);
                setProblem(null);
                setSelected(null);
                setTab("graph");
              }}
              diagnostic={diagnostic}
              label="Program source"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3">
            <label htmlFor="method" className="sr-only">
              Search method
            </label>
            <Select id="method" value={method} onChange={(event) => setMethod(event.target.value)} className="min-w-40 flex-1">
              {RULE_METHODS.map((name) => (
                <option key={name} value={name}>
                  {methodLabel(name)}
                </option>
              ))}
            </Select>
            <Button variant="primary" onClick={run} pending={running} disabled={!source.trim() || diagnostic !== null}>
              Optimize
            </Button>
            <Button variant="ghost" onClick={copyLink}>
              Copy link
            </Button>
          </div>
        </Panel>

        {diagnostic ? (
          <Callout tone="refused" title={`Line ${diagnostic.line}, column ${diagnostic.column}`}>
            {diagnostic.message}
          </Callout>
        ) : null}
        {analysis.status === "unavailable" ? (
          analysis.problem === "offline" ? (
            <EngineOffline />
          ) : (
            <Callout tone="caution">{analysis.message}</Callout>
          )
        ) : null}
        {problem ? <Callout tone="refused">{problem}</Callout> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {events.length > 0 ? <FinalVerdict summary={trace.summary} /> : null}

        <Panel bodyClassName="px-4 pb-4">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList className="-mx-4 px-4 pt-1">
              <TabsTrigger value="graph">Flow graph</TabsTrigger>
              <TabsTrigger value="tac">TAC</TabsTrigger>
              <TabsTrigger value="dataflow">Dataflow</TabsTrigger>
              <TabsTrigger value="trace">
                Trace
                {trace.steps.length > 0 ? (
                  <span className="ml-1.5 font-terminal text-xs text-muted">{trace.steps.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="diff" disabled={!finished} className="disabled:opacity-40">
                Before / after
              </TabsTrigger>
            </TabsList>

            {(["graph", "tac", "dataflow"] as const).map((name) => (
              <TabsContent key={name} value={name} className={cx(analysis.status === "invalid" && "opacity-50")}>
                {shown === null ? (
                  !source.trim() ? (
                    <p className="py-8 text-center text-sm text-muted">Enter a program or choose a sample to see its analysis.</p>
                  ) : diagnostic ? (
                    <p className="py-8 text-center text-sm text-refused">{diagnostic.message}</p>
                  ) : analysis.status === "unavailable" ? (
                    <p className="py-8 text-center text-sm text-muted">{analysis.message}</p>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <Skeleton className="h-16 w-60" />
                      <Skeleton className="h-6 w-px" />
                      <Skeleton className="h-24 w-60" />
                    </div>
                  )
                ) : name === "graph" ? (
                  <>
                    <CfgGraph analysis={shown} selected={selected} onSelect={setSelected} />
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      Blocks in program order. Green and red exits are a branch taken and not taken;
                      dashed lines on the left go back to a loop head. Select a block to find it in the
                      other tabs.
                    </p>
                  </>
                ) : name === "tac" ? (
                  <TacView analysis={shown} selected={selected} onSelect={setSelected} />
                ) : (
                  <DataflowTable analysis={shown} selected={selected} onSelect={setSelected} />
                )}
              </TabsContent>
            ))}

            <TabsContent value="trace">
              {events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  Pick a method and press Optimize. Every step shows up here as the engine takes it.
                </p>
              ) : (
                <TraceStepList
                  steps={trace.steps}
                  status={trace.summary.status}
                  initialTac={trace.initialTac}
                />
              )}
            </TabsContent>

            <TabsContent value="diff">
              {finished && trace.finalTac !== null ? (
                <DiffView before={trace.initialTac} after={trace.finalTac} />
              ) : null}
            </TabsContent>
          </Tabs>
        </Panel>
      </div>
    </div>
  );
}
