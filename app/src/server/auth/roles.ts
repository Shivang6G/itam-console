// Pure functions only: no I/O, so the permission matrix is trivially unit-testable.

export const ROLES = ["viewer", "technician", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "view"
  | "ticket:create"
  | "ticket:update"
  | "asset:write"
  | "asset:delete"
  | "attachment:upload"
  | "license:manage"
  | "audit:view";

const MATRIX: Record<Permission, readonly Role[]> = {
  view: ["viewer", "technician", "admin"],
  "ticket:create": ["viewer", "technician", "admin"],
  "ticket:update": ["technician", "admin"],
  "asset:write": ["technician", "admin"],
  "attachment:upload": ["technician", "admin"],
  "asset:delete": ["admin"],
  "license:manage": ["admin"],
  "audit:view": ["admin"],
};

const RANK: Record<Role, number> = { viewer: 1, technician: 2, admin: 3 };

/** Highest-privilege role found in the Cognito groups claim, or null if none. */
export function roleFromGroups(groups: readonly string[] | undefined | null): Role | null {
  let best: Role | null = null;
  for (const g of groups ?? []) {
    if ((ROLES as readonly string[]).includes(g)) {
      const r = g as Role;
      if (!best || RANK[r] > RANK[best]) best = r;
    }
  }
  return best;
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && MATRIX[permission].includes(role);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export interface SessionUser {
  sub: string;
  email: string | null;
  name: string | null;
  groups: string[];
  role: Role | null;
}

/** Throws 401/403 HttpError. Call at the top of every mutation. */
export function requirePermission(user: SessionUser | null, permission: Permission): SessionUser {
  if (!user) throw new HttpError(401, "Not signed in");
  if (!user.role) throw new HttpError(403, "No role assigned. Ask an administrator to add you to a group.");
  if (!can(user.role, permission)) throw new HttpError(403, `Role '${user.role}' may not perform '${permission}'`);
  return user;
}
