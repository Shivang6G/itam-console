import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { env } from "../env";
import { logger } from "../logger";
import { exchangeCode, refreshTokens, userFromClaims, verifyIdToken, type TokenSet } from "./cognito";
import { roleFromGroups, type Role, type SessionUser } from "./roles";

export const COOKIE_ID = "itam_id";
export const COOKIE_REFRESH = "itam_rt";
export const COOKIE_PKCE = "itam_pkce";
export const COOKIE_DEV = "itam_dev";

function secureCookies(): boolean {
  const base = env().PUBLIC_BASE_URL;
  if (base) return base.startsWith("https://");
  return env().NODE_ENV === "production";
}

function baseOpts(maxAge: number) {
  return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge };
}

export function storeTokens(t: TokenSet, keepRefresh = true) {
  setCookie(COOKIE_ID, t.id_token, baseOpts(Math.max(60, t.expires_in)));
  if (t.refresh_token && keepRefresh) setCookie(COOKIE_REFRESH, t.refresh_token, baseOpts(60 * 60 * 24 * 30));
}

export function clearSession() {
  deleteCookie(COOKIE_ID, { path: "/" });
  deleteCookie(COOKIE_REFRESH, { path: "/" });
  deleteCookie(COOKIE_DEV, { path: "/" });
  deleteCookie(COOKIE_PKCE, { path: "/" });
}

export function setPkceCookie(value: string) {
  setCookie(COOKIE_PKCE, value, baseOpts(600));
}

// ---- Development-only identity ----------------------------------------------------

export function devAuthEnabled(): boolean {
  return env().DEV_AUTH === "1" && env().NODE_ENV !== "production";
}

export function setDevUser(role: Role | "none", name: string, email: string) {
  const groups = role === "none" ? [] : [role];
  const payload = { sub: `dev-${email}`, email, name, "cognito:groups": groups };
  setCookie(COOKIE_DEV, Buffer.from(JSON.stringify(payload)).toString("base64url"), baseOpts(60 * 60 * 8));
}

function readDevUser(): SessionUser | null {
  if (!devAuthEnabled()) return null;
  const raw = getCookie(COOKIE_DEV);
  if (!raw) return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const u = userFromClaims(p);
    return { ...u, role: roleFromGroups(u.groups) };
  } catch {
    return null;
  }
}

// ---- The one function every server function and route uses -------------------------

/** Returns the signed-in user, silently refreshing an expired id token, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const dev = readDevUser();
  if (dev) return dev;

  const id = getCookie(COOKIE_ID);
  if (id) {
    try {
      return await verifyIdToken(id);
    } catch (err) {
      logger.debug({ err: (err as Error).message }, "id_token_rejected");
    }
  }

  const rt = getCookie(COOKIE_REFRESH);
  if (!rt) return null;
  try {
    const tokens = await refreshTokens(rt);
    storeTokens(tokens, false); // refresh grant does not return a new refresh token
    return await verifyIdToken(tokens.id_token);
  } catch (err) {
    logger.info({ err: (err as Error).message }, "refresh_failed");
    clearSession();
    return null;
  }
}

export { exchangeCode };
