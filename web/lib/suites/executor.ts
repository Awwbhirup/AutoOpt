/**
 * Working through a suite run's queue.
 *
 * Every run of a suite is created QUEUED up front. A worker claims one at a
 * time (QUEUED -> RUNNING in a single statement, so two workers never take the
 * same run), streams it from the engine into the same recorder a single run
 * uses, and moves on until the queue is empty or its time is up.
 *
 * Nothing holds the queue but the table. A worker that dies leaves at most one
 * run RUNNING, which the next worker marks ABANDONED once it is old enough, and
 * the rest of the queue is still there to be picked up by whoever comes next:
 * the background task started with the suite run, or the progress stream of
 * anyone watching it.
 */

import type { RunStatus } from "@prisma/client";

import type { StreamedEvent } from "../events";

export interface ClaimedRun {
  runId: string;
  programId: string;
  source: string;
  category: string;
  method: string;
  seed: number;
  proveFinal: boolean;
}

/** The storage a worker needs. Narrow on purpose, so it can be faked in a test. */
export interface SuiteStore {
  /** Take the next queued run, or null when nothing is queued. */
  claimNext(suiteRunId: string): Promise<ClaimedRun | null>;
  /** Mark RUNNING runs started before `before` as abandoned; how many were. */
  sweepStale(suiteRunId: string, before: Date): Promise<number>;
  /** Recount progress and close the suite run when nothing is left. */
  refresh(suiteRunId: string): Promise<{ remaining: number; status: RunStatus }>;
  /** Put a claimed run back in the queue, untouched, to be tried again. */
  requeue(runId: string): Promise<void>;
}

export interface Recorder {
  record(event: StreamedEvent): Promise<void>;
  finish(): Promise<RunStatus>;
}

export interface ExecutorDeps {
  store: SuiteStore;
  recorder(runId: string): Recorder;
  optimize(run: ClaimedRun, signal: AbortSignal): AsyncIterable<StreamedEvent>;
  failure(runId: string, error: unknown): StreamedEvent;
  /** True for a refusal worth waiting out (the engine was busy), not a failure. */
  retryable?(error: unknown): boolean;
  /** Waits between retries; injectable so tests do not sleep. */
  sleep?(ms: number): Promise<void>;
  now?(): number;
}

/** Waits after a busy refusal, doubling, capped. */
export const BUSY_BACKOFF_MS = [1000, 2000, 4000, 8000];

/** A RUNNING run older than this has lost its worker. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export interface AdvanceResult {
  ran: number;
  remaining: number;
  status: RunStatus;
  /** True when it stopped for time rather than for an empty queue. */
  outOfTime: boolean;
}

/**
 * Run queued runs until the queue is empty or `deadline` (epoch ms) passes.
 * The deadline is checked between runs only; a run that has started is always
 * finished, because stopping one halfway would leave it to be swept later.
 */
export async function advanceSuiteRun(
  deps: ExecutorDeps,
  suiteRunId: string,
  deadline: number,
  signal: AbortSignal = new AbortController().signal,
): Promise<AdvanceResult> {
  const now = deps.now ?? Date.now;
  await deps.store.sweepStale(suiteRunId, new Date(now() - STALE_AFTER_MS));

  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let ran = 0;
  let busyStreak = 0;
  for (;;) {
    if (now() >= deadline || signal.aborted) {
      const progress = await deps.store.refresh(suiteRunId);
      return { ran, ...progress, outOfTime: progress.remaining > 0 };
    }

    const run = await deps.store.claimNext(suiteRunId);
    if (run === null) break;

    const recorder = deps.recorder(run.runId);
    let recorded = 0;
    let requeued = false;
    try {
      for await (const event of deps.optimize(run, signal)) {
        await recorder.record(event);
        recorded += 1;
      }
    } catch (error) {
      // Refused before anything happened because the engine was full: not
      // this run's failure. Back in the queue, and wait before claiming again.
      if (recorded === 0 && deps.retryable?.(error) && busyStreak < BUSY_BACKOFF_MS.length) {
        requeued = true;
      } else if (!signal.aborted) {
        await recorder.record(deps.failure(run.runId, error));
      }
    }
    if (requeued) {
      await deps.store.requeue(run.runId);
      await sleep(BUSY_BACKOFF_MS[busyStreak]);
      busyStreak += 1;
      continue;
    }
    busyStreak = 0;
    await recorder.finish();
    ran += 1;
    await deps.store.refresh(suiteRunId);
  }

  const progress = await deps.store.refresh(suiteRunId);
  return { ran, ...progress, outOfTime: false };
}
