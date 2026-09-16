"use server";

/**
 * Creating a program from pasted source.
 *
 * Two things have to hold before the insert, and neither can be inferred from
 * the other: the caller may create programs in this workspace, and the project
 * they named is in this workspace. A project id is a form field, so without the
 * second check a MEMBER of one workspace could write into another's project.
 */

import { revalidatePath } from "next/cache";

import { auth } from "../../auth";
import { authorize } from "../authorize";
import { DEFAULT_CATEGORY, isCategory } from "../categories";
import { prisma } from "../db";
import { createProgram as insertProgram } from "../repositories/programs";
import { findProject } from "../repositories/projects";
import { findWorkspaceBySlug } from "../repositories/workspaces";
import { principalFor } from "../session";
import {
  type ActionState,
  created,
  failed,
  field,
  NO_WORKSPACE,
  SIGNED_OUT,
} from "./form";

const MAX_NAME = 80;
/** Far past anything the language is for, and short of a paste that is a file. */
const MAX_SOURCE = 100_000;

const NO_PROJECT = "That project does not exist.";

export async function createProgram(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const slug = field(form, "workspace");
  const projectId = field(form, "projectId");
  const name = field(form, "name");
  const source = field(form, "source");
  const category = field(form, "category");

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return failed(SIGNED_OUT);

  if (!name) return failed("A program needs a name.");
  if (name.length > MAX_NAME) {
    return failed(`A program name is at most ${MAX_NAME} characters.`);
  }
  if (!source) return failed("Paste the program source.");
  if (source.length > MAX_SOURCE) {
    return failed("That source is too long to store.");
  }

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) return failed(NO_WORKSPACE);

  const principal = await principalFor(prisma, userId, workspace.id);
  if (!authorize(principal, "program:create")) {
    return failed(
      principal.role === null
        ? NO_WORKSPACE
        : "Your role in this workspace does not allow adding programs.",
    );
  }

  const project = await findProject(prisma, projectId);
  // Refused the same way whether the project is missing or another
  // workspace's, so the form cannot be used to find out which project ids exist.
  if (project === null || project.workspaceId !== workspace.id) {
    return failed(NO_PROJECT);
  }

  const program = await insertProgram(prisma, {
    projectId: project.id,
    authorId: userId,
    name,
    source,
    category: isCategory(category) ? category : DEFAULT_CATEGORY,
  });

  revalidatePath(`/w/${workspace.slug}/projects`);
  return created(program.id);
}
