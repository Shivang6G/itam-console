import crypto from "node:crypto";
import { logger } from "./logger";
import { HttpError, requirePermission, type Permission, type SessionUser } from "./auth/roles";
import { currentUser } from "./auth/session";
import { getDb, type Db } from "./db";
import { auditLog } from "./db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Wraps one server-side operation: resolves the user, enforces the permission,
 * times it, and writes one structured log line (requestId, userSub, route, ms).
 */
export async function run<T>(
  route: string,
  permission: Permission | null,
  fn: (user: SessionUser | null) => Promise<T>,
): Promise<T> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let userSub: string | undefined;
  try {
    const user = await currentUser();
    userSub = user?.sub;
    if (permission) requirePermission(user, permission);
    const out = await fn(user);
    logger.info({ requestId, userSub, route, ms: Math.round(performance.now() - started) }, "request");
    return out;
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    logger[status >= 500 ? "error" : "warn"](
      { requestId, userSub, route, status, err: (err as Error).message, ms: Math.round(performance.now() - started) },
      "request_failed",
    );
    if (err instanceof HttpError) throw new Error(err.message);
    throw new Error("Something went wrong. Reference: " + requestId);
  }
}

/** Writes the audit row inside the caller's transaction so it commits or rolls back with the change. */
export async function audit(
  tx: Tx,
  user: SessionUser,
  action: string,
  entity: string,
  entityId: string,
  diff?: unknown,
) {
  await tx.insert(auditLog).values({
    actorSub: user.sub,
    actorEmail: user.email,
    action,
    entity,
    entityId,
    diff: diff === undefined ? null : (diff as object),
  });
}

export function db(): Db {
  return getDb();
}

/** Shallow diff of changed fields: { field: [before, after] } */
export function diffOf(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(after)) {
    const b = before[k] ?? null;
    const a = after[k] ?? null;
    if (String(b) !== String(a)) out[k] = [b, a];
  }
  return out;
}
