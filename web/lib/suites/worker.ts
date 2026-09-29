/**
 * The executor wired to the real database, recorder and engine.
 */

import { RunRecorder, runFailure } from "../actions/runs";
import { prisma } from "../db";
import { optimize } from "../service";
import { classifyServiceError } from "../service-errors";
import { advanceSuiteRun, type AdvanceResult, type ExecutorDeps } from "./executor";
import { prismaSuiteStore } from "./store";

export function suiteExecutor(): ExecutorDeps {
  return {
    store: prismaSuiteStore(prisma),
    recorder: (runId) => new RunRecorder(prisma, runId),
    optimize: (run, signal) =>
      optimize({
        source: run.source,
        method: run.method,
        seed: run.seed,
        proveFinal: run.proveFinal,
        programId: run.programId,
        category: run.category,
        signal,
      }),
    failure: runFailure,
    retryable: (error) => classifyServiceError(error).problem === "busy",
  };
}

/**
 * Work on a suite run for up to `budgetMs`. Errors are logged, not thrown:
 * this runs after a response has gone, where nobody is left to catch them,
 * and whatever it did not finish is still queued for the next worker.
 */
export async function workOnSuiteRun(
  suiteRunId: string,
  budgetMs: number,
  signal?: AbortSignal,
): Promise<AdvanceResult | null> {
  try {
    return await advanceSuiteRun(suiteExecutor(), suiteRunId, Date.now() + budgetMs, signal);
  } catch (error) {
    console.error(`suite run ${suiteRunId} worker stopped`, error);
    return null;
  }
}
