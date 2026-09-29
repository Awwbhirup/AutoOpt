/**
 * A program, run or page that is not in this workspace. Worded the same for
 * one that never existed and one that belongs to someone else, for the reason
 * lib/workspace.ts gives.
 */

import { PageMain } from "@/components/app/frame";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/surface";

export default function WorkspaceNotFound() {
  return (
    <PageMain>
      <Panel>
        <EmptyState
          title="Nothing here"
          action={
            <ButtonLink href="/w" variant="primary">
              Back to your workspace
            </ButtonLink>
          }
        >
          There is no such page in this workspace. The link may be old, or it may point at
          something you do not have access to.
        </EmptyState>
      </Panel>
    </PageMain>
  );
}
