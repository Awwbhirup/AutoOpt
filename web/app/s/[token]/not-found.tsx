import { PageMain } from "@/components/app/frame";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/surface";

export default function SharedNotFound() {
  return (
    <PageMain width="narrow">
      <Panel>
        <EmptyState
          title="No such link"
          action={
            <ButtonLink href="/try" variant="primary">
              Try the optimizer
            </ButtonLink>
          }
        >
          Check that the whole link was copied. Links are long on purpose, so they cannot be guessed.
        </EmptyState>
      </Panel>
    </PageMain>
  );
}
