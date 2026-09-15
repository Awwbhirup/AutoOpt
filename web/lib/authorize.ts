/**
 * Every permission decision in the application, in one place.
 *
 * One function rather than a check at each call site, because scattered checks
 * are how a route ends up being the only one that forgot. Deny by default: an
 * action nobody has been granted is refused, so adding an action to the union
 * without adding it to the table below denies it rather than allowing it.
 *
 * Roles come from the plan's table and are ordered by authority, which lets
 * "at least ADMIN" be a comparison instead of a list of roles to remember.
 */

export const ROLES = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

/** Higher wins. Only meaningful through `atLeast`. */
const RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const ACTIONS = [
  "workspace:delete",
  "workspace:update",
  "member:invite",
  "member:remove",
  "member:changeRole",
  "apiKey:manage",
  "quota:manage",
  "project:create",
  "project:delete",
  "program:create",
  "program:delete",
  "run:start",
  "run:delete",
  "suite:create",
  "suite:run",
  "share:create",
  "share:revoke",
  "run:view",
  "trace:view",
  "analytics:view",
  "auditLog:view",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * The subject of a decision. A user who is not a member of the workspace has no
 * role at all, which is different from having the weakest one.
 */
export interface Principal {
  userId: string;
  role: Role | null;
}

/**
 * What is being acted on. `ownerId` matters only for the actions a MEMBER may
 * perform on their own rows and not on other people's.
 */
export interface Resource {
  ownerId?: string | null;
}

/** Minimum role for actions where ownership plays no part. */
const MINIMUM: Partial<Record<Action, Role>> = {
  "workspace:delete": "OWNER",
  "workspace:update": "ADMIN",
  "member:invite": "ADMIN",
  "member:remove": "ADMIN",
  "member:changeRole": "ADMIN",
  "apiKey:manage": "ADMIN",
  "quota:manage": "ADMIN",
  "auditLog:view": "ADMIN",
  "project:create": "MEMBER",
  "project:delete": "ADMIN",
  "program:create": "MEMBER",
  "run:start": "MEMBER",
  "suite:create": "MEMBER",
  "suite:run": "MEMBER",
  "share:create": "MEMBER",
  "share:revoke": "ADMIN",
  "run:view": "VIEWER",
  "trace:view": "VIEWER",
  "analytics:view": "VIEWER",
};

/**
 * Actions a MEMBER may take on rows they created, and an ADMIN on anyone's.
 * Kept apart from MINIMUM because a rank comparison cannot express "own only",
 * and hiding that distinction inside the table is how it would get lost.
 */
const OWN_ONLY_FOR_MEMBER: ReadonlySet<Action> = new Set<Action>([
  "run:delete",
  "program:delete",
]);

function atLeast(role: Role | null, minimum: Role): boolean {
  return role !== null && RANK[role] >= RANK[minimum];
}

/**
 * May this principal take this action on this resource?
 *
 * Returns a plain boolean. Callers that need to tell "not allowed" from "not
 * found" should make that distinction themselves, since leaking which
 * workspaces exist is a decision about the response, not about permission.
 */
export function authorize(
  principal: Principal,
  action: Action,
  resource: Resource = {},
): boolean {
  // Not a member of the workspace. Nothing further to consider.
  if (principal.role === null) return false;

  if (OWN_ONLY_FOR_MEMBER.has(action)) {
    if (atLeast(principal.role, "ADMIN")) return true;
    if (principal.role === "MEMBER") {
      return resource.ownerId != null && resource.ownerId === principal.userId;
    }
    return false;
  }

  const minimum = MINIMUM[action];
  // Deny by default: an action with no entry is one nobody has been granted.
  if (minimum === undefined) return false;

  return atLeast(principal.role, minimum);
}

/** Throwing form, for call sites where carrying on makes no sense. */
export class NotAuthorizedError extends Error {
  constructor(
    readonly action: Action,
    readonly userId: string,
  ) {
    super(`not authorized to ${action}`);
    this.name = "NotAuthorizedError";
  }
}

export function requireAuthorized(
  principal: Principal,
  action: Action,
  resource: Resource = {},
): void {
  if (!authorize(principal, action, resource)) {
    throw new NotAuthorizedError(action, principal.userId);
  }
}
