/**
 * What a failed call to the compute service means for the person looking at
 * it. The service answers 503 when all its slots are busy, 413 when a request
 * is over its size limit and 504 when a run outlives its time budget; each of
 * those gets a sentence that says what to do, not a status code.
 */

import { ServiceError } from "./service";

export type ServiceProblem = "busy" | "too_large" | "timeout" | "offline" | "refused" | "failed";

export interface ClassifiedProblem {
  problem: ServiceProblem;
  message: string;
}

const MESSAGES: Record<Exclude<ServiceProblem, "refused">, string> = {
  failed: "the run could not be completed",
  busy: "The engine is busy with other runs. Try again in a moment.",
  too_large: "That program is larger than the engine accepts. Try a shorter one.",
  timeout: "The engine ran out of time on this program before it finished.",
  offline: "The optimization engine is offline, so this could not run.",
};

export function classifyServiceError(error: unknown): ClassifiedProblem {
  if (error instanceof ServiceError) {
    if (error.status === 503) return { problem: "busy", message: MESSAGES.busy };
    if (error.status === 413) return { problem: "too_large", message: MESSAGES.too_large };
    if (error.status === 504) return { problem: "timeout", message: MESSAGES.timeout };
    // Not configured in this deployment: the same as nothing answering.
    if (error.message.includes("AUTOOPT_SERVICE_URL")) return { problem: "offline", message: MESSAGES.offline };
    return { problem: "refused", message: error.message };
  }
  // fetch rejects with a TypeError when nothing answers at the address.
  if (error instanceof TypeError) return { problem: "offline", message: MESSAGES.offline };
  // Anything else is ours (the database, say) and its text is not for the reader.
  return { problem: "failed", message: MESSAGES.failed };
}
