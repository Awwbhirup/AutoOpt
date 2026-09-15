/**
 * The client for the compute service.
 *
 * The service streams newline-delimited JSON, so the job here is to turn a
 * byte stream into parsed events without waiting for the end of it. Buffering
 * the response would be simpler and would remove the only reason the trace is
 * worth watching.
 *
 * Nothing in this file persists anything. The caller decides what to keep.
 */

import { type StreamedEvent, streamedEvent } from "./events";

export interface OptimizeOptions {
  source: string;
  method?: string;
  seed?: number;
  maxIterations?: number;
  useSmt?: boolean;
  proveFinal?: boolean;
  nodeBudget?: number | null;
  programId?: string;
  category?: string;
  signal?: AbortSignal;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function baseUrl(): string {
  const url = process.env.AUTOOPT_SERVICE_URL;
  if (!url) {
    throw new ServiceError("AUTOOPT_SERVICE_URL is not set");
  }
  return url.replace(/\/$/, "");
}

/**
 * Split a byte stream into lines as they arrive.
 *
 * A chunk boundary falls wherever the network puts it, which is regularly in
 * the middle of a JSON object, so the tail of each chunk is held back until
 * the newline that completes it shows up.
 */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) yield line;
        newline = buffer.indexOf("\n");
      }
    }
    // A final line with no trailing newline is still a line.
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Run one program and yield its decision log as it is produced.
 *
 * Parsing is strict on purpose. A line that does not match a known event means
 * this tier and the engine disagree about the contract, and carrying on would
 * drop steps out of a trace while looking like it worked.
 */
export async function* optimize(
  options: OptimizeOptions,
): AsyncGenerator<StreamedEvent> {
  const response = await fetch(`${baseUrl()}/optimize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      source: options.source,
      method: options.method ?? "greedy",
      seed: options.seed ?? 0,
      ...(options.maxIterations === undefined ? {} : { max_iterations: options.maxIterations }),
      use_smt: options.useSmt ?? false,
      prove_final: options.proveFinal ?? false,
      node_budget: options.nodeBudget ?? null,
      program_id: options.programId ?? "program",
      category: options.category ?? "mixed",
    }),
  });

  if (!response.ok) {
    // Refused before the stream opened, so there is a body worth reading.
    const detail = await response.text().catch(() => "");
    throw new ServiceError(
      `compute service refused the run: ${detail || response.statusText}`,
      response.status,
    );
  }
  if (!response.body) {
    throw new ServiceError("compute service returned no body");
  }

  for await (const line of readLines(response.body)) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new ServiceError(`compute service sent a line that is not JSON: ${line.slice(0, 200)}`);
    }

    const parsed = streamedEvent.safeParse(raw);
    if (!parsed.success) {
      throw new ServiceError(
        `unrecognised event from the compute service: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
      );
    }
    yield parsed.data;
  }
}

export interface Vocabulary {
  event_kinds: string[];
  optimization_types: string[];
  verification_methods: string[];
  verification_verdicts: string[];
  reject_reasons: string[];
}

/** What the service says it can emit. Used by the drift test. */
export async function vocabulary(signal?: AbortSignal): Promise<Vocabulary> {
  const response = await fetch(`${baseUrl()}/schema`, { signal });
  if (!response.ok) {
    throw new ServiceError(`could not read the service vocabulary`, response.status);
  }
  return (await response.json()) as Vocabulary;
}

export interface MethodInfo {
  name: string;
  kind: "rule_based" | "llm";
}

/**
 * The methods this deployment offers.
 *
 * Asked rather than hardcoded, so adding a model to the engine's registry
 * offers it in the interface without anything here being edited to match.
 */
export async function methods(signal?: AbortSignal): Promise<MethodInfo[]> {
  const response = await fetch(`${baseUrl()}/methods`, { signal });
  if (!response.ok) {
    throw new ServiceError("could not read the available methods", response.status);
  }
  const body = (await response.json()) as { methods: MethodInfo[] };
  return body.methods;
}
