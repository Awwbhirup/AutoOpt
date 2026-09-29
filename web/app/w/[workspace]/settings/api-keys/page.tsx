import Link from "next/link";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { Timestamp } from "@/components/shell/timestamp";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

import { revokeApiKey } from "./actions";
import { CreateKeyForm } from "./create-key-form";

export default async function ApiKeysPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const { workspace, principal } = await requireWorkspace(slug);
  if (!authorize(principal, "apiKey:manage")) notFound();
  const keys = await prisma.apiKey.findMany({
    where: { workspaceId: workspace.id },
    select: {
      id: true, name: true, prefix: true, scopes: true, createdAt: true,
      lastUsedAt: true, expiresAt: true, revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PageMain width="narrow">
      <PageHeader
        eyebrow={<Link href={`/w/${slug}/settings`}>Settings / API keys</Link>}
        title="API keys"
        lead="Give each integration only the access it needs. A key is shown once when it is made."
        actions={<Link href="/docs/api" className="text-sm underline underline-offset-4">API reference</Link>}
      />
      <div className="space-y-6">
        <Panel title="Create a key" bodyClassName="p-4 sm:p-5">
          <CreateKeyForm slug={slug} />
        </Panel>
        <Panel title="Keys" aside={`${keys.length} total`}>
          {keys.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No keys yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{key.name}</p>
                    <p className="font-terminal mt-1 text-xs text-muted">{key.prefix}...</p>
                    <p className="mt-2 text-xs text-muted">
                      {key.scopes.join(", ")} / created <Timestamp at={key.createdAt} />
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {key.revokedAt ? "Revoked" : key.expiresAt && key.expiresAt <= new Date() ? "Expired" : "Active"}
                      {key.lastUsedAt ? <> / last used <Timestamp at={key.lastUsedAt} /></> : null}
                    </p>
                  </div>
                  {!key.revokedAt ? (
                    <form action={revokeApiKey}>
                      <input type="hidden" name="workspace" value={slug} />
                      <input type="hidden" name="keyId" value={key.id} />
                      <Button type="submit" variant="danger" size="sm">Revoke</Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageMain>
  );
}
