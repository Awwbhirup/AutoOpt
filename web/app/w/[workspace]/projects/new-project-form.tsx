"use client";

/**
 * The create-project dialog.
 *
 * The workspace travels as its slug, the same string the URL carries, and the
 * action resolves it again rather than believing a hidden id. Whether the
 * button is shown at all is decided on the server; this is convenience, not
 * the check.
 *
 * The action is wrapped so that success closes the dialog and says so, in the
 * same transition that revalidates the list behind it. A refusal leaves the
 * dialog open with the fields as typed.
 */

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionState } from "@/lib/actions/form";
import { createProject } from "@/lib/actions/projects";

export function NewProjectDialog({
  slug,
  label = "New project",
  variant = "primary",
}: {
  slug: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const [state, submit, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const next = await createProject(previous, form);
      if (next.createdId !== null) {
        setOpen(false);
        toast({ title: "Project created", description: String(form.get("name") ?? ""), tone: "kept" });
      }
      return next;
    },
    IDLE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>{label}</Button>
      </DialogTrigger>
      <DialogContent
        title="New project"
        description="A project groups programs, for example the ones from one course or one codebase."
      >
        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="workspace" value={slug} />

          <Field label="Name" htmlFor="project-name" error={state.error}>
            <Input
              id="project-name"
              name="name"
              required
              maxLength={80}
              autoComplete="off"
              placeholder="Front end"
              aria-invalid={state.error !== null || undefined}
              aria-describedby={state.error ? "project-name-error" : undefined}
            />
          </Field>

          <Field label="Description" htmlFor="project-description" hint="Optional, up to 500 characters.">
            <Input
              id="project-description"
              name="description"
              maxLength={500}
              autoComplete="off"
            />
          </Field>

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" pending={pending}>
              Create project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
