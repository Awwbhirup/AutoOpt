"use server";

/**
 * Creating a project.
 *
 * The workspace arrives as a slug in the form, which is the same string the URL
 * carries and is trusted no further than that: the role is resolved for the
 * user in the session against that slug, and authorize() decides, before the
 * insert. A MEMBER may create one, a VIEWER may not.
 */

import { revalidatePath } from "next/cache";

import { auth } from "../../auth";
import { authorize } from "../authorize";
import { prisma } from "../db";
import { createProject as insertProject } from "../repositories/projects";
import { findWorkspaceBySlug } from "../repositories/workspaces";
import { principalFor } from "../session";
import {
  type ActionState,
  created,
  failed,
  field,
  isUniqueViolation,
  NO_WORKSPACE,
  SIGNED_OUT,
} from "./form";

/** Long enough for a sentence, short enough to sit in a list without wrapping. */
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

export async function createProject(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const slug = field(form, "workspace");
  const name = field(form, "name");
  const description = field(form, "description");

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return failed(SIGNED_OUT);

  if (!name) return failed("A project needs a name.");
  if (name.length > MAX_NAME) {
    return failed(`A project name is at most ${MAX_NAME} characters.`);
  }
  if (description.length > MAX_DESCRIPTION) {
    return failed(`A description is at most ${MAX_DESCRIPTION} characters.`);
  }

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) return failed(NO_WORKSPACE);

  const principal = await principalFor(prisma, userId, workspace.id);
  if (!authorize(principal, "project:create")) {
    // A non-member is told what a stranger is told. Someone who is in the
    // workspace already knows it exists, so they get the real reason.
    return failed(
      principal.role === null
        ? NO_WORKSPACE
        : "Your role in this workspace does not allow creating projects.",
    );
  }

  try {
    const project = await insertProject(prisma, {
      workspaceId: workspace.id,
      name,
      description: description || null,
    });
    revalidatePath(`/w/${workspace.slug}/projects`);
    return created(project.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return failed("A project with that name already exists here.");
    }
    throw error;
  }
}
