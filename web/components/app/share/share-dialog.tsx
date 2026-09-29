"use client";

/**
 * Sharing a run or a suite run: make a link with an optional expiry, copy it,
 * and see (and, as an admin, revoke) the links that already exist for it.
 */

import { useActionState, useState, useSyncExternalStore } from "react";

import { RevokeShare } from "@/components/app/share/revoke-share";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Callout } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { createShareLink } from "@/lib/actions/shares";
import { EXPIRY_OPTIONS, sharePath, type ShareState } from "@/lib/shares";

export interface ShareRow {
  id: string;
  token: string;
  state: ShareState;
  expiresAt: string | null;
  viewCount: number;
  createdBy: string;
}

const noop = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}

const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

function CopyField({ url }: { url: string }) {
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="font-terminal text-xs" aria-label="Share link" />
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast({ title: "Link copied", tone: "kept" });
          } catch {
            toast({ title: "Could not copy", description: "Select the link and copy it by hand.", tone: "refused" });
          }
        }}
      >
        Copy
      </Button>
    </div>
  );
}

export function ShareDialog({
  slug,
  target,
  links,
  mayCreate,
  mayRevoke,
  what,
}: {
  slug: string;
  target: { runId: string } | { suiteRunId: string };
  links: ShareRow[];
  mayCreate: boolean;
  mayRevoke: boolean;
  /** "this run" or "these results", for the sentences in the dialog. */
  what: string;
}) {
  const origin = useOrigin();
  const toast = useToast();
  const [fresh, setFresh] = useState<string | null>(null);

  const [state, create, creating] = useActionState(async (previous: ActionState, form: FormData) => {
    const next = await createShareLink(previous, form);
    if (next.createdId !== null) {
      setFresh(next.createdId);
      toast({ title: "Link created", description: "Anyone with it can read this, nothing else.", tone: "kept" });
    }
    return next;
  }, IDLE);

  const active = links.filter((link) => link.state === "active").length;

  return (
    <Dialog onOpenChange={(open) => (open ? null : setFresh(null))}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          Share
          {active > 0 ? <span className="font-terminal text-xs text-muted">{active}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Share ${what}`}
        description={`A link opens a read-only copy of ${what} to anyone who has it, without signing in. Nothing else in the workspace is visible through it.`}
        className="max-w-xl"
      >
        {mayCreate ? (
          <form action={create} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="workspace" value={slug} />
            {"runId" in target ? (
              <input type="hidden" name="runId" value={target.runId} />
            ) : (
              <input type="hidden" name="suiteRunId" value={target.suiteRunId} />
            )}
            <Field label="Stops working after" htmlFor="share-expires">
              <Select id="share-expires" name="expires" defaultValue="never" className="w-40">
                {Object.entries(EXPIRY_OPTIONS).map(([key, option]) => (
                  <option key={key} value={key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="primary" pending={creating}>
              Create link
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Your role can read links but not create them.</p>
        )}

        {state.error ? <Callout tone="refused" className="mt-3">{state.error}</Callout> : null}
        {fresh ? (
          <div className="mt-4">
            <CopyField url={`${origin}${sharePath(fresh)}`} />
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium tracking-wide text-foreground/75">
            Links to {what}
          </h3>
          {links.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {links.map((link) => (
                <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                  <a
                    href={sharePath(link.token)}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-focus min-w-0 truncate font-terminal text-xs underline-offset-4 hover:underline"
                  >
                    /s/{link.token.slice(0, 10)}...
                  </a>
                  <Badge
                    tone={link.state === "active" ? "kept" : link.state === "expired" ? "caution" : "neutral"}
                    dashed={link.state !== "active"}
                  >
                    {link.state}
                  </Badge>
                  <span className="text-xs text-muted">
                    {link.expiresAt ? `until ${WHEN.format(new Date(link.expiresAt))}` : "no expiry"}, {link.viewCount}{" "}
                    {link.viewCount === 1 ? "view" : "views"}, by {link.createdBy}
                  </span>
                  {mayRevoke && link.state === "active" ? (
                    <div className="ml-auto">
                      <RevokeShare slug={slug} shareId={link.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
