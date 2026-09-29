"use client";

/**
 * A suite run's progress, live. Listens to the progress stream and refreshes
 * the server-rendered results under it as runs land, at most every couple of
 * seconds, so the charts fill in while the suite works.
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { cancelSuiteRun } from "@/lib/actions/suites";
import type { SuiteProgressSnapshot } from "@/lib/suites/progress";

const REFRESH_EVERY_MS = 2000;

const LIVE = new Set(["QUEUED", "RUNNING"]);

export function SuiteProgress({
  suiteRunId,
  slug,
  initial,
  mayCancel,
}: {
  suiteRunId: string;
  slug: string;
  initial: SuiteProgressSnapshot;
  mayCancel: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState(initial);
  const lastRefresh = useRef(0);
  const live = LIVE.has(progress.status) || progress.running > 0;

  useEffect(() => {
    if (!LIVE.has(initial.status) && initial.running === 0) return;
    const source = new EventSource(`/api/suite-runs/${suiteRunId}/stream`);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      const wait = REFRESH_EVERY_MS - (Date.now() - lastRefresh.current);
      if (timer !== null) return;
      timer = setTimeout(
        () => {
          timer = null;
          lastRefresh.current = Date.now();
          router.refresh();
        },
        Math.max(wait, 0),
      );
    };

    source.addEventListener("progress", (event) => {
      setProgress(JSON.parse((event as MessageEvent).data) as SuiteProgressSnapshot);
      refresh();
    });
    source.addEventListener("done", (event) => {
      const done = JSON.parse((event as MessageEvent).data) as SuiteProgressSnapshot;
      setProgress(done);
      source.close();
      router.refresh();
      toast({
        title: done.status === "SUCCEEDED" ? "Suite finished" : "Suite stopped",
        description: `${done.succeeded} of ${done.total} runs succeeded.`,
        tone: done.status === "SUCCEEDED" ? "kept" : "info",
      });
    });

    return () => {
      source.close();
      if (timer !== null) clearTimeout(timer);
    };
  }, [suiteRunId, initial.status, initial.running, router, toast]);

  const [, cancel, cancelling] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const next = await cancelSuiteRun(previous, form);
      if (next.error) toast({ title: "Could not stop it", description: next.error, tone: "refused" });
      else toast({ title: "Stopping", description: "Queued runs are dropped; the current one finishes." });
      return next;
    },
    IDLE,
  );

  const share = progress.total === 0 ? 0 : progress.completed / progress.total;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {live ? (
          <Badge tone="info" mark=">">
            running
          </Badge>
        ) : progress.status === "SUCCEEDED" ? (
          <Badge tone="kept" mark="+">
            finished
          </Badge>
        ) : progress.status === "FAILED" ? (
          <Badge tone="refused" mark="x">
            failed
          </Badge>
        ) : (
          <Badge tone="caution" mark="-">
            stopped
          </Badge>
        )}
        <span className="font-terminal text-sm tabular-nums" role="status" aria-live="polite">
          {progress.completed} / {progress.total} runs
          {progress.failed > 0 ? <span className="text-muted">, {progress.failed} did not finish</span> : null}
        </span>
        {live && mayCancel ? (
          <form action={cancel} className="ml-auto">
            <input type="hidden" name="workspace" value={slug} />
            <input type="hidden" name="suiteRunId" value={suiteRunId} />
            <Button type="submit" size="sm" variant="ghost" pending={cancelling}>
              Stop
            </Button>
          </form>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        aria-label="Suite progress"
        className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-ramp-0 via-ramp-2 to-ramp-4 transition-[width] duration-700 ease-out"
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}
