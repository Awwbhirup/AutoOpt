/**
 * A Prisma client that runs no queries and remembers the arguments it was
 * given. Used only by the repository tests.
 *
 * What is worth testing about a repository is the query it builds: the where
 * clause that keeps one workspace's rows out of another's, the ordering that
 * makes a decision log replayable, the join the page needs. A real database
 * would check that Prisma works, which is not in doubt, at the cost of needing
 * one to run the suite at all.
 */

import type { PrismaClient } from "@prisma/client";

export interface RecordedCall {
  model: string;
  method: string;
  args: Record<string, unknown>;
}

export interface FakePrisma {
  client: PrismaClient;
  calls: RecordedCall[];
  /** The only call, for the single-query reads that most of these are. */
  only(): RecordedCall;
}

/**
 * `results` is keyed "model.method", for example "workspace.findUnique".
 * Anything not listed resolves to null, which is what an unfound row is.
 */
export function fakePrisma(results: Record<string, unknown> = {}): FakePrisma {
  const calls: RecordedCall[] = [];

  const model = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, method) {
          if (typeof method !== "string") return undefined;
          return (args: Record<string, unknown> = {}) => {
            calls.push({ model: name, method, args });
            return Promise.resolve(results[`${name}.${method}`] ?? null);
          };
        },
      },
    );

  const client = new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== "string") return undefined;
        return model(name);
      },
    },
  ) as unknown as PrismaClient;

  return {
    client,
    calls,
    only() {
      if (calls.length !== 1) {
        throw new Error(`expected exactly one query, got ${calls.length}`);
      }
      return calls[0];
    },
  };
}
