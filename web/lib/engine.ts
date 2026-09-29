/**
 * Whether the compute service answers, and which methods it can run, asked
 * with a short timeout. Pages use it to say "engine offline" instead of
 * failing when the service is down or not configured.
 *
 * `available` is read if the service sends it (a model arm with no provider
 * key would run the stub instead); a service that does not send it is taken
 * at its word that every method it lists can run.
 */

import { methods } from "./service";

export interface EngineMethod {
  name: string;
  kind: string;
  available: boolean;
}

export interface EngineStatus {
  online: boolean;
  /** Empty when offline. */
  methods: EngineMethod[];
}

export async function engineStatus(timeoutMs = 2500): Promise<EngineStatus> {
  try {
    const list = await methods(AbortSignal.timeout(timeoutMs));
    return {
      online: true,
      methods: list.map((method) => ({
        name: method.name,
        kind: method.kind,
        available: (method as { available?: unknown }).available !== false,
      })),
    };
  } catch {
    return { online: false, methods: [] };
  }
}

/** Names of the methods that can run now. */
export function runnableMethods(status: EngineStatus): string[] {
  return status.methods.filter((method) => method.available).map((method) => method.name);
}
