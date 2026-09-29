/** Share links as the dialog shows them: plain values, safe to pass to a client component. */

import type { ShareListEntry } from "./repositories/shares";
import { shareState } from "./shares";

export function toShareRows(links: readonly ShareListEntry[], now = new Date()) {
  return links.map((link) => ({
    id: link.id,
    token: link.token,
    state: shareState(link, now),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    createdBy: link.createdBy?.name ?? link.createdBy?.email ?? "someone since removed",
  }));
}
