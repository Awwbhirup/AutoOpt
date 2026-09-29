/**
 * Every share link in the workspace: what it opens, whether it still works,
 * how often it has been opened. Revoking is here as well as on each page,
 * for the admin tidying up after a demo.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { PageMain } from "@/components/app/frame";
import { RevokeShare } from "@/components/app/share/revoke-share";
import { Timestamp } from "@/components/shell/timestamp";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { methodLabel } from "@/lib/methods";
import { listSharesInWorkspace, type ShareListEntry } from "@/lib/repositories/shares";
import { sharePath, shareState } from "@/lib/shares";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Shared links" };

export default async function SharesPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const { workspace, principal } = await requireWorkspace(slug);
  const links = await listSharesInWorkspace(prisma, workspace.id);
  const mayRevoke = authorize(principal, "share:revoke");
  const now = new Date();

  const columns: Column<ShareListEntry>[] = [
    {
      key: "what",
      header: "Shares",
      cell: (link) =>
        link.run ? (
          <Link href={`/w/${slug}/runs/${link.run.id}`} className="ui-focus font-medium underline-offset-4 hover:underline">
            {link.run.program.name}
            <span className="ml-1.5 text-xs font-normal text-muted">{methodLabel(link.run.method)} run</span>
          </Link>
        ) : link.suiteRun ? (
          <Link
            href={`/w/${slug}/suites/${link.suiteRun.suite.id}/runs/${link.suiteRun.id}`}
            className="ui-focus font-medium underline-offset-4 hover:underline"
          >
            {link.suiteRun.suite.name}
            <span className="ml-1.5 text-xs font-normal text-muted">suite results</span>
          </Link>
        ) : (
          <span className="text-muted">deleted</span>
        ),
    },
    {
      key: "state",
      header: "State",
      cell: (link) => {
        const state = shareState(link, now);
        return (
          <Badge tone={state === "active" ? "kept" : state === "expired" ? "caution" : "neutral"} dashed={state !== "active"}>
            {state}
          </Badge>
        );
      },
    },
    { key: "views", header: "Views", align: "right", mono: true, cell: (link) => link.viewCount },
    {
      key: "link",
      header: "Link",
      wide: true,
      mono: true,
      cell: (link) => (
        <a href={sharePath(link.token)} target="_blank" rel="noreferrer" className="ui-focus underline-offset-4 hover:underline">
          /s/{link.token.slice(0, 10)}...
        </a>
      ),
    },
    {
      key: "by",
      header: "Created",
      wide: true,
      className: "text-xs",
      cell: (link) => (
        <span className="text-foreground/75">
          {link.createdBy?.name ?? link.createdBy?.email ?? "someone since removed"}, <Timestamp at={link.createdAt} />
        </span>
      ),
    },
    {
      key: "revoke",
      header: <span className="sr-only">Revoke</span>,
      align: "right",
      cell: (link) =>
        mayRevoke && shareState(link, now) === "active" ? <RevokeShare slug={slug} shareId={link.id} /> : null,
    },
  ];

  return (
    <PageMain>
      <PageHeader
        eyebrow={workspace.name}
        title="Shared links"
        lead="Read-only links to runs and suite results, open to anyone who has them until revoked or expired."
      />
      <Panel title="Links" aside={links.length === 0 ? undefined : `${links.length}`}>
        {links.length === 0 ? (
          <EmptyState title="Nothing is shared">
            Use Share on a run or on suite results to make a link. Links can expire on their own.
          </EmptyState>
        ) : (
          <DataTable columns={columns} rows={links} rowKey={(link) => link.id} caption="Shared links" />
        )}
      </Panel>
    </PageMain>
  );
}
