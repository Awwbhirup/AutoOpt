/**
 * The permission table from the plan, asserted row by row.
 *
 * Written as the table rather than as a list of cases so that a rule and its
 * test read the same way, and so a row that was never considered is visible as
 * a gap rather than as an absence of tests.
 */

import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  type Action,
  authorize,
  NotAuthorizedError,
  type Principal,
  requireAuthorized,
  type Role,
  ROLES,
} from "./authorize";

const ALICE = "user_alice";
const BOB = "user_bob";

function principal(role: Role | null, userId = ALICE): Principal {
  return { userId, role };
}

/** yes/no per role, in the plan's own column order. */
type Row = [Action, boolean, boolean, boolean, boolean];

//                                    OWNER  ADMIN  MEMBER VIEWER
const TABLE: Row[] = [
  ["workspace:delete", true, false, false, false],
  ["workspace:update", true, true, false, false],
  ["member:invite", true, true, false, false],
  ["member:remove", true, true, false, false],
  ["member:changeRole", true, true, false, false],
  ["apiKey:manage", true, true, false, false],
  ["quota:manage", true, true, false, false],
  ["auditLog:view", true, true, false, false],
  ["project:create", true, true, true, false],
  // Not in the plan's table. Deleting a project cascades to every program and
  // run inside it, so it sits with the other destructive workspace actions
  // rather than with creating one.
  ["project:delete", true, true, false, false],
  ["program:create", true, true, true, false],
  ["run:start", true, true, true, false],
  ["suite:create", true, true, true, false],
  ["suite:run", true, true, true, false],
  // Sharing publishes a run to anyone holding the link, so a member may create
  // one, but taking a published link back is an administrative act.
  ["share:create", true, true, true, false],
  ["share:revoke", true, true, false, false],
  ["run:view", true, true, true, true],
  ["trace:view", true, true, true, true],
  ["analytics:view", true, true, true, true],
];

describe("the permission table", () => {
  it.each(TABLE)("%s", (action, owner, admin, member, viewer) => {
    expect(authorize(principal("OWNER"), action)).toBe(owner);
    expect(authorize(principal("ADMIN"), action)).toBe(admin);
    expect(authorize(principal("MEMBER"), action)).toBe(member);
    expect(authorize(principal("VIEWER"), action)).toBe(viewer);
  });
});

describe("deleting runs and programs", () => {
  const OWNED = { ownerId: ALICE };
  const SOMEONE_ELSES = { ownerId: BOB };

  it.each(["run:delete", "program:delete"] as const)(
    "%s: a member may delete their own and nobody else's",
    (action) => {
      expect(authorize(principal("MEMBER"), action, OWNED)).toBe(true);
      expect(authorize(principal("MEMBER"), action, SOMEONE_ELSES)).toBe(false);
    },
  );

  it.each(["run:delete", "program:delete"] as const)(
    "%s: admins and owners may delete anyone's",
    (action) => {
      expect(authorize(principal("ADMIN"), action, SOMEONE_ELSES)).toBe(true);
      expect(authorize(principal("OWNER"), action, SOMEONE_ELSES)).toBe(true);
    },
  );

  it.each(["run:delete", "program:delete"] as const)(
    "%s: viewers may delete nothing, including rows attributed to them",
    (action) => {
      expect(authorize(principal("VIEWER"), action, OWNED)).toBe(false);
    },
  );

  it("an unowned row is not everyone's to delete", () => {
    // A row whose creator was deleted has ownerId null. Matching null against
    // null would hand it to every member in the workspace.
    expect(authorize(principal("MEMBER"), "run:delete", { ownerId: null })).toBe(false);
    expect(authorize(principal("MEMBER"), "run:delete", {})).toBe(false);
  });
});

describe("deny by default", () => {
  it("refuses everything to a non-member", () => {
    for (const action of ACTIONS) {
      expect(authorize(principal(null), action, { ownerId: ALICE })).toBe(false);
    }
  });

  it("refuses an action that is not in the table", () => {
    // The failure mode this guards: adding an action to the union and
    // forgetting the rule. It must deny, not allow.
    const unlisted = "workspace:transfer" as Action;
    for (const role of ROLES) {
      expect(authorize(principal(role), unlisted)).toBe(false);
    }
  });

  it("covers every action it declares", () => {
    // Nothing may be reachable in the type without a decision behind it.
    const decided = new Set([...TABLE.map(([action]) => action), "run:delete", "program:delete"]);
    const missing = ACTIONS.filter((action) => !decided.has(action));
    expect(missing).toEqual([]);
  });
});

describe("requireAuthorized", () => {
  it("passes silently when allowed", () => {
    expect(() => requireAuthorized(principal("OWNER"), "workspace:delete")).not.toThrow();
  });

  it("throws with the action that was refused", () => {
    try {
      requireAuthorized(principal("VIEWER"), "workspace:delete");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NotAuthorizedError);
      expect((error as NotAuthorizedError).action).toBe("workspace:delete");
      expect((error as NotAuthorizedError).userId).toBe(ALICE);
    }
  });
});

describe("role authority", () => {
  it("is ordered weakest to strongest", () => {
    expect(ROLES).toEqual(["VIEWER", "MEMBER", "ADMIN", "OWNER"]);
  });

  it("never grants a weaker role something a stronger one lacks", () => {
    // The property behind the table: authority is monotonic. A row that broke
    // it would be a mistake in the table rather than a real rule.
    const resource = { ownerId: ALICE };
    for (const action of ACTIONS) {
      const granted = ROLES.map((role) => authorize(principal(role), action, resource));
      const firstYes = granted.indexOf(true);
      if (firstYes === -1) continue;
      expect(granted.slice(firstYes).every(Boolean)).toBe(true);
    }
  });
});
