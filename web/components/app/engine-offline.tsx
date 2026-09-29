/**
 * Said wherever running something needs the compute service and it is not
 * answering. Reading stored runs and results still works, and the note says so.
 */

import { Callout } from "@/components/ui/surface";

export function EngineOffline({ className }: { className?: string }) {
  return (
    <Callout tone="caution" title="Engine offline" className={className}>
      The optimization engine is not answering, so new runs cannot start. Everything already
      recorded can still be read.
    </Callout>
  );
}
