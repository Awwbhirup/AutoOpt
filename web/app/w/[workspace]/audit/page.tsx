/**
 * What has been done in this workspace, most recent first.
 *
 * Admin only, which is why this is a page of its own rather than a panel on the
 * settings page: a screen everyone can open would have to hide most of itself,
 * and a member arriving at a mostly empty page learns nothing from it.
 *
 * Entries name their subject by type and id, so one survives the membership it
 * describes being deleted. The email in the metadata is what makes a removal
 * readable afterwards, since by then the row it pointed at is gone.
 */

import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { Timestamp } from "@/components/shell/timestamp";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { listEntries, type AuditLogEntry } from "@/lib/repositories/audit";
import { requireWorkspace } from "@/lib/workspace";

const WORDING: Record<string, string> = {
  "member.added": "added",
  "member.role_changed": "changed the role of",
  "member.removed": "removed",
};

/**
 * The part of an entry that varies, read defensively.
 *
 * metadata is a Json column, so what is in it is whatever was written, possibly
 * by an older version of the code. A page is not the place to discover it was
 * an array.
 */
function detail(entry: AuditLogEntry): string {
  const meta = entry.metadata;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return "";
  const at = meta as Record<string, unknown>;
  const who = typeof at.email === "string" ? at.email : entry.resourceId;

  if (entry.action === "member.role_changed") {
    const from = typeof at.from === "string" ? at.from.toLowerCase() : "?";
    const to = typeof at.to === "string" ? at.to.toLowerCase() : "?";
    return `${who}, ${from} to ${to}`;
  }
  const role = typeof at.role === "string" ? ` as ${at.role.toLowerCase()}` : "";
  return `${who}${role}`;
}

export default async function AuditPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, principal } = await requireWorkspace(slug);

  // A member who may not read this is told what a stranger is told. That there
  // is an audit log here is itself something they have not been granted.
  if (!authorize(principal, "auditLog:view")) notFound();

  const entries = await listEntries(prisma, workspace.id);

  return (
    <PageMain>
      <PageHeader
        eyebrow={workspace.name}
        title="Audit log"
        lead="Changes to who is in this workspace and what they may do."
      />

      <Panel
        title="Recent activity"
        aside={entries.length === 0 ? undefined : `${entries.length} shown`}
      >
        {entries.length === 0 ? (
          <EmptyState compact title="Nothing has been recorded yet">
            Members being added or removed, and role changes, are written here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2 px-4 py-3 text-sm">
                <span className="text-foreground">
                  {entry.actor?.name ?? entry.actor?.email ?? "someone since removed"}
                </span>
                <span className="text-muted">
                  {WORDING[entry.action] ?? entry.action}
                </span>
                <span className="text-foreground">
                  {detail(entry)}
                </span>
                <span className="ml-auto text-xs text-muted">
                  <Timestamp at={entry.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageMain>
  );
}
