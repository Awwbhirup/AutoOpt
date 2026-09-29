/**
 * The playground's program and method, kept in the URL hash so a link carries
 * them. The hash never reaches the server, and lz-string keeps a few dozen
 * lines of MiniLang to a link that still pastes.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export interface PlaygroundState {
  source: string;
  method: string;
}

/** Past this a link stops being something anyone pastes; the playground caps input anyway. */
export const MAX_SHARED_SOURCE = 8000;

export function encodeState(state: PlaygroundState): string {
  const params = new URLSearchParams();
  params.set("m", state.method);
  params.set("code", compressToEncodedURIComponent(state.source.slice(0, MAX_SHARED_SOURCE)));
  return params.toString();
}

/** The state in a hash (with or without the leading #), or null if it has none or it does not decode. */
export function decodeState(hash: string): PlaygroundState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("code");
  if (!code) return null;
  const source = decompressFromEncodedURIComponent(code);
  if (!source) return null;
  const method = params.get("m");
  return {
    source: source.slice(0, MAX_SHARED_SOURCE),
    method: method && /^[a-z_]{1,40}$/.test(method) ? method : "greedy",
  };
}
