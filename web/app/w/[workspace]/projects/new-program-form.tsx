"use client";

/**
 * Adding a program by pasting its source, in a dialog opened from its project.
 *
 * Pasted rather than uploaded. A program here is a few dozen lines of MiniLang
 * that someone is usually copying out of an editor, and a file picker would put
 * a step in front of the common case.
 *
 * One of these renders per project, so every id it hands out carries the
 * project's, or the labels would all point at the first form on the page.
 */

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { createProgram } from "@/lib/actions/programs";
import { CATEGORIES, categoryLabel, DEFAULT_CATEGORY } from "@/lib/categories";

export function NewProgramDialog({
  slug,
  projectId,
  projectName,
}: {
  slug: string;
  projectId: string;
  projectName: string;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const id = (field: string) => `${projectId}-${field}`;

  const [state, submit, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const next = await createProgram(previous, form);
      if (next.createdId !== null) {
        setOpen(false);
        toast({
          title: "Program added",
          description: `${String(form.get("name") ?? "")} is in ${projectName}.`,
          tone: "kept",
        });
      }
      return next;
    },
    IDLE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Add program
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a program"
        description={
          <>
            Paste MiniLang source into {projectName}. The{" "}
            <Link href="/docs" className="underline underline-offset-4">
              language docs
            </Link>{" "}
            list what it supports.
          </>
        }
        className="max-w-2xl"
      >
        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="workspace" value={slug} />
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field label="Name" htmlFor={id("name")}>
              <Input
                id={id("name")}
                name="name"
                required
                maxLength={80}
                autoComplete="off"
                placeholder="Loop sample"
              />
            </Field>
            <Field label="Category" htmlFor={id("category")}>
              <Select id={id("category")} name="category" defaultValue={DEFAULT_CATEGORY}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Source" htmlFor={id("source")} error={state.error}>
            <Textarea
              id={id("source")}
              name="source"
              required
              rows={12}
              mono
              spellCheck={false}
              placeholder={"input x;\nint a = 2 + 3;\nprint(a + x);"}
              aria-invalid={state.error !== null || undefined}
            />
          </Field>

          <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" pending={pending}>
              Add program
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
