/**
 * Turning a signed-in user into the Principal that authorize() takes.
 *
 * The permission table knows about roles and nothing about rows, so reading the
 * membership is kept here rather than folded into it. One query, one place: a
 * caller that forgets it cannot accidentally authorize against a role it made
 * up.
 *
 * The user id is passed in rather than read from the session inside, because
 * requests authenticated by an API key have a user behind them and no session
 * at all, and both paths need the same answer.
 */

import type { Principal, Role } from "./authorize";

/**
 * The only call this makes, typed as itself instead of as PrismaClient. A whole
 * client is not needed to read one row, and demanding one would mean a test
 * could not stand in for it without a database behind it.
 */
export interface MembershipStore {
  membership: {
    findUnique(args: {
      where: { userId_workspaceId: { userId: string; workspaceId: string } };
      select: { role: true };
    }): PromiseLike<{ role: Role } | null>;
  };
}

/**
 * The user's standing in one workspace.
 *
 * A missing row is `role: null`, which authorize() refuses everything to. That
 * is deliberately not VIEWER: a stranger and a person invited to look on are
 * not the same, and the difference is the tenancy boundary.
 */
export async function principalFor(
  db: MembershipStore,
  userId: string,
  workspaceId: string,
): Promise<Principal> {
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });

  return { userId, role: membership?.role ?? null };
}
