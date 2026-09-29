import type { RunStatus } from "@prisma/client";

/** What the suite run progress stream sends on each change. */
export interface SuiteProgressSnapshot {
  status: RunStatus;
  total: number;
  completed: number;
  running: number;
  succeeded: number;
  failed: number;
}
