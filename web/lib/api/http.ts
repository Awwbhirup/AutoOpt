import type { KeyAuth } from "./keys";

export function keyError(auth: Extract<KeyAuth, { ok: false }>): Response {
  return Response.json({ error: auth.error }, {
    status: auth.status,
    headers: { "cache-control": "no-store" },
  });
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
