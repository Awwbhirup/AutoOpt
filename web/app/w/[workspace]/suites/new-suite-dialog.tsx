"use client";

/**
 * Creating a suite: a name, the programs it runs, the methods it compares and
 * how many seeds each gets. The run count is worked out as the boxes are
 * ticked, so the size of what is being asked for is visible before it is.
 */

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Callout } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { createSuite } from "@/lib/actions/suites";
import { cx } from "@/lib/cx";
import { DEFAULT_SUITE_METHODS, methodMeta } from "@/lib/methods";
import { MAX_SEEDS, MAX_SUITE_RUNS } from "@/lib/suites/grid";

export interface PickableProgram {
  id: string;
  name: string;
  project: string;
  category: string;
}

const CHECK =
  "flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2 text-sm transition-colors hover:border-foreground/25 has-[:checked]:border-ramp-2 has-[:checked]:bg-ramp-2/5";

export function NewSuiteDialog({
  slug,
  programs,
  methods,
  label = "New suite",
}: {
  slug: string;
  programs: PickableProgram[];
  methods: string[];
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(programs.slice(0, 8).map((p) => p.id)));
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(DEFAULT_SUITE_METHODS.filter((method) => methods.includes(method))),
  );
  const [seeds, setSeeds] = useState(1);

  const [state, submit, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const next = await createSuite(previous, form);
      if (next.createdId !== null) {
        setOpen(false);
        toast({ title: "Suite created", description: String(form.get("name") ?? ""), tone: "kept" });
        router.push(`/w/${slug}/suites/${next.createdId}`);
      }
      return next;
    },
    IDLE,
  );

  const byProject = useMemo(() => {
    const groups = new Map<string, PickableProgram[]>();
    for (const program of programs) {
      const list = groups.get(program.project);
      if (list) list.push(program);
      else groups.set(program.project, [program]);
    }
    return [...groups.entries()];
  }, [programs]);

  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const runs = picked.size * chosen.size * seeds;
  const tooMany = runs > MAX_SUITE_RUNS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">{label}</Button>
      </DialogTrigger>
      <DialogContent
        title="New benchmark suite"
        description="The same programs through several methods, so the methods can be compared on equal terms."
        className="max-w-2xl"
      >
        <form action={submit} className="flex flex-col gap-5">
          <input type="hidden" name="workspace" value={slug} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="suite-name">
              <Input id="suite-name" name="name" required maxLength={80} autoComplete="off" placeholder="Loops, all methods" />
            </Field>
            <Field label="Description" htmlFor="suite-description" hint="Optional.">
              <Input id="suite-description" name="description" maxLength={500} autoComplete="off" />
            </Field>
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-2 flex w-full items-baseline justify-between text-xs font-medium tracking-wide text-foreground/75">
              Programs
              <span className="font-terminal text-muted tabular-nums">{picked.size} picked</span>
            </legend>
            <div className="max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-line p-2" data-lenis-prevent>
              {byProject.map(([project, list]) => (
                <div key={project} className="mb-2 last:mb-0">
                  <p className="px-1 pb-1 text-xs text-muted">{project}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {list.map((program) => (
                      <label key={program.id} className={CHECK}>
                        <input
                          type="checkbox"
                          name="programIds"
                          value={program.id}
                          checked={picked.has(program.id)}
                          onChange={() => setPicked((set) => toggle(set, program.id))}
                          className="mt-0.5 accent-(--ramp-2)"
                        />
                        <span className="min-w-0 truncate">{program.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-medium tracking-wide text-foreground/75">Methods</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {methods.map((method) => {
                const meta = methodMeta(method);
                return (
                  <label key={method} className={CHECK}>
                    <input
                      type="checkbox"
                      name="methods"
                      value={method}
                      checked={chosen.has(method)}
                      onChange={() => setChosen((set) => toggle(set, method))}
                      className="mt-0.5 accent-(--ramp-2)"
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{meta.label}</span>
                      {meta.baseline ? <span className="ml-1.5 text-xs text-muted">control</span> : null}
                      {meta.note ? <span className="block text-xs text-muted">{meta.note}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-end gap-4">
            <Field label="Seeds per program and method" htmlFor="suite-seeds">
              <Select
                id="suite-seeds"
                name="seeds"
                value={String(seeds)}
                onChange={(event) => setSeeds(Number(event.target.value))}
                className="w-40"
              >
                {Array.from({ length: MAX_SEEDS }, (_, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="proveFinal" className="accent-(--ramp-2)" />
              Ask Z3 for a final proof
            </label>
          </div>

          <p className={cx("font-terminal text-sm tabular-nums", tooMany ? "text-refused" : "text-foreground/75")}>
            {picked.size} programs x {chosen.size} methods x {seeds} {seeds === 1 ? "seed" : "seeds"} = {runs} runs
            {tooMany ? ` (limit ${MAX_SUITE_RUNS})` : ""}
          </p>

          {state.error ? <Callout tone="refused">{state.error}</Callout> : null}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" pending={pending} disabled={runs === 0 || tooMany}>
              Create suite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
