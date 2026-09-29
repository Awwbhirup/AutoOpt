"use client";

import { WorkspaceNav } from "@/components/shell/nav";

const LINKS = [
  { href: "/try", label: "Playground" },
  { href: "/docs", label: "Docs" },
];

export function PublicNav() {
  return (
    <div className="min-w-0">
      <WorkspaceNav links={LINKS} />
    </div>
  );
}
