/**
 * Resolving a suite run for a signed-in caller, for the route handlers that
 * have no page around them to do it.
 */

import { auth } from "../../auth";
import { authorize, type Principal } from "../authorize";
import { prisma } from "../db";
import { findSuiteRun, type SuiteRunDetail } from "../repositories/suites";
import { principalFor } from "../session";

export type SuiteRunAccess =
  | { ok: true; suiteRun: SuiteRunDetail; principal: Principal }
  | { ok: false; status: 401 | 404 };

export async function suiteRunForCaller(suiteRunId: string): Promise<SuiteRunAccess> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401 };

  const suiteRun = await findSuiteRun(prisma, suiteRunId);
  if (suiteRun === null) return { ok: false, status: 404 };

  const principal = await principalFor(prisma, userId, suiteRun.suite.workspaceId);
  // A stranger gets the same 404 as a made-up id.
  if (!authorize(principal, "run:view")) return { ok: false, status: 404 };
  return { ok: true, suiteRun, principal };
}
