"use client";

/**
 * What a workspace page shows when rendering it threw. The header above stays,
 * so the way to another page is still there; retry re-renders the segment.
 */

import { useEffect } from "react";

import { PageMain } from "@/components/app/frame";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/surface";

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageMain>
      <Panel>
        <EmptyState
          title="This page could not be loaded"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => retry()}>
                Try again
              </Button>
              <ButtonLink href="/w" variant="ghost">
                Back to your workspace
              </ButtonLink>
            </div>
          }
        >
          Something failed while reading it, most likely the database or the compute service.
          {error.digest ? (
            <span className="font-terminal tabular-nums mt-2 block text-xs text-muted">ref {error.digest}</span>
          ) : null}
        </EmptyState>
      </Panel>
    </PageMain>
  );
}
