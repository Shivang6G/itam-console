import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { currentUser, devAuthEnabled } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { profiles } from "@/server/db/schema";
import { can, type Permission } from "@/server/auth/roles";

const PERMS: Permission[] = ["asset:write", "asset:delete", "ticket:create", "ticket:update", "attachment:upload", "license:manage", "audit:view"];

/** Current user plus a flat map of what they may do, so the UI can hide buttons. The server still enforces everything. */
export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser();
  if (!user) return { user: null, can: {} as Record<string, boolean>, devAuth: devAuthEnabled() };
  // First sign-in creates the profile row; later calls just refresh the cached role.
  try {
    await getDb()
      .insert(profiles)
      .values({ id: user.sub, email: user.email, fullName: user.name, roleCache: user.role })
      .onConflictDoUpdate({ target: profiles.id, set: { email: user.email, fullName: user.name, roleCache: user.role } });
  } catch {
    /* profile bookkeeping must never block sign-in */
  }
  void eq;
  return {
    user: { sub: user.sub, email: user.email, name: user.name, role: user.role },
    can: Object.fromEntries(PERMS.map((p) => [p, can(user.role, p)])) as Record<string, boolean>,
    devAuth: devAuthEnabled(),
  };
});

export const getAuthConfig = createServerFn({ method: "GET" }).handler(async () => ({ devAuth: devAuthEnabled() }));
