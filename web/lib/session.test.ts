/**
 * Role resolution, against a fake holding a handful of membership rows.
 *
 * The cases that matter are the ones where a row is absent or belongs to
 * another workspace, since both have to come back as no role rather than as a
 * weak one.
 */

import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { Role } from "./authorize";
import { type MembershipStore, principalFor } from "./session";

const ALICE = "user_alice";
const ACME = "ws_acme";
const OTHER = "ws_other";

interface Row {
  userId: string;
  workspaceId: string;
  role: Role;
}

type Query = Parameters<MembershipStore["membership"]["findUnique"]>[0];

function store(rows: Row[]) {
  const queries: Query[] = [];
  const db: MembershipStore = {
    membership: {
      async findUnique(args) {
        queries.push(args);
        const { userId, workspaceId } = args.where.userId_workspaceId;
        const row = rows.find((r) => r.userId === userId && r.workspaceId === workspaceId);
        return row ? { role: row.role } : null;
      },
    },
  };
  return { db, queries };
}

describe("principalFor", () => {
  it("asks for something the real client would accept", () => {
    // The fake below is only worth trusting while this assignment compiles.
    // Nothing is constructed and no database is touched: renaming the compound
    // key or changing the Role enum breaks the typecheck here rather than the
    // first query in production.
    const real = {} as PrismaClient;
    const store: MembershipStore = real;
    expect(store).toBe(real);
  });

  it.each(["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const)(
    "reports a member's role: %s",
    async (role) => {
      const { db } = store([{ userId: ALICE, workspaceId: ACME, role }]);
      expect(await principalFor(db, ALICE, ACME)).toEqual({ userId: ALICE, role });
    },
  );

  it("gives a non-member no role at all", async () => {
    const { db } = store([]);
    expect(await principalFor(db, ALICE, ACME)).toEqual({ userId: ALICE, role: null });
  });

  it("does not carry a role over from another workspace", async () => {
    // The tenancy boundary. An owner of one workspace is a stranger to the next.
    const { db } = store([{ userId: ALICE, workspaceId: OTHER, role: "OWNER" }]);
    expect(await principalFor(db, ALICE, ACME)).toEqual({ userId: ALICE, role: null });
  });

  it("does not carry a role over from another user", async () => {
    const { db } = store([{ userId: "user_bob", workspaceId: ACME, role: "ADMIN" }]);
    expect(await principalFor(db, ALICE, ACME)).toEqual({ userId: ALICE, role: null });
  });

  it("asks for one row by the pair, and for nothing but the role", async () => {
    // The pair is the unique key on Membership. Looking a membership up by
    // either half alone would return someone else's row.
    const { db, queries } = store([{ userId: ALICE, workspaceId: ACME, role: "MEMBER" }]);
    await principalFor(db, ALICE, ACME);
    expect(queries).toEqual([
      {
        where: { userId_workspaceId: { userId: ALICE, workspaceId: ACME } },
        select: { role: true },
      },
    ]);
  });
});
