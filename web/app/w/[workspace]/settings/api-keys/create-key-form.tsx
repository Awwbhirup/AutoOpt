"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { KEY_SCOPES } from "@/lib/api/scopes";

import { createApiKey, type KeyActionState } from "./actions";

const INITIAL: KeyActionState = { error: null, key: null };

export function CreateKeyForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(createApiKey, INITIAL);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="workspace" value={slug} />
        <label className="block text-sm font-medium">
          Name
          <input name="name" required maxLength={80} placeholder="Build pipeline" className="ui-input mt-2 w-full" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Access</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <input type="checkbox" name="scope" value={scope} defaultChecked={scope.endsWith(":read")} />
                <span className="font-terminal text-xs">{scope}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">
          Expiry
          <select name="expiry" defaultValue="90d" className="ui-input mt-2 w-full">
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="never">No expiry</option>
          </select>
        </label>
        {state.error ? <p role="alert" className="text-sm text-refused">{state.error}</p> : null}
        <Button type="submit" variant="primary" pending={pending}>Create key</Button>
      </form>
      {state.key ? (
        <div role="status" className="rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-sm font-semibold">Copy this key now</p>
          <p className="mt-1 text-xs text-muted">It cannot be shown again after you leave this page.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="font-terminal min-w-0 flex-1 break-all text-xs">{state.key}</code>
            <Button type="button" size="sm" onClick={async () => {
              await navigator.clipboard.writeText(state.key ?? "");
              setCopied(true);
            }}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
