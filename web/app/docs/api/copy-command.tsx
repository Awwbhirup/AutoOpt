"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyCommand({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="min-w-0 rounded-lg border border-line bg-foreground/5">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="font-terminal text-xs uppercase tracking-wider text-muted">{label}</span>
        <Button size="sm" onClick={async () => {
          await navigator.clipboard.writeText(command);
          setCopied(true);
        }}>{copied ? "Copied" : "Copy"}</Button>
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6"><code className="font-terminal">{command}</code></pre>
    </figure>
  );
}
