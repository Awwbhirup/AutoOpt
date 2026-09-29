"use client";

/** The button that queues a suite run and opens its results as they arrive. */

import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { startSuiteRun } from "@/lib/actions/suites";

export function StartSuiteRun({
  slug,
  suiteId,
  runs,
  disabled,
}: {
  slug: string;
  suiteId: string;
  runs: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [, submit, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const next = await startSuiteRun(previous, form);
      if (next.createdId !== null) {
        toast({ title: "Suite queued", description: `${runs} runs, results fill in as they land.`, tone: "info" });
        router.push(`/w/${slug}/suites/${suiteId}/runs/${next.createdId}`);
      } else if (next.error) {
        toast({ title: "Suite not started", description: next.error, tone: "refused" });
      }
      return next;
    },
    IDLE,
  );

  return (
    <form action={submit}>
      <input type="hidden" name="workspace" value={slug} />
      <input type="hidden" name="suiteId" value={suiteId} />
      <Button type="submit" variant="primary" pending={pending} disabled={disabled}>
        Run suite
      </Button>
    </form>
  );
}
