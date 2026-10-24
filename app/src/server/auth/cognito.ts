import crypto from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { requireEnv } from "../env";
import { roleFromGroups, type SessionUser } from "./roles";

export interface TokenSet {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

// ---- PKCE helpers -----------------------------------------------------

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newPkce() {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(24));
  return { verifier, challenge, state };
}

// ---- Hosted UI URLs -----------------------------------------------------

function domainBase(): string {
  const d = requireEnv("COGNITO_DOMAIN");
  return d.startsWith("http") ? d : `https://${d}`;
}

export function redirectUri(): string {
  return `${requireEnv("PUBLIC_BASE_URL").replace(/\/$/, "")}/auth/callback`;
}

export function authorizeUrl(challenge: string, state: string): string {
  const u = new URL(`${domainBase()}/oauth2/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", requireEnv("COGNITO_CLIENT_ID"));
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export function logoutUrl(): string {
  const u = new URL(`${domainBase()}/logout`);
  u.searchParams.set("client_id", requireEnv("COGNITO_CLIENT_ID"));
  u.searchParams.set("logout_uri", `${requireEnv("PUBLIC_BASE_URL").replace(/\/$/, "")}/signin`);
  return u.toString();
}

// ---- Token endpoint (confidential client: HTTP Basic) ---------------------

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const id = requireEnv("COGNITO_CLIENT_ID");
  const secret = requireEnv("COGNITO_CLIENT_SECRET");
  const res = await fetch(`${domainBase()}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ client_id: id, ...params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cognito token endpoint ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenSet;
}

export function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri() });
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// ---- Token verification -----------------------------------------------------

let verifier: ReturnType<typeof CognitoJwtVerifier.create<{ userPoolId: string; tokenUse: "id"; clientId: string }>> | undefined;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
      tokenUse: "id",
      clientId: requireEnv("COGNITO_CLIENT_ID"),
    });
  }
  return verifier;
}

/** Verifies signature, issuer, audience, token_use and expiry. Throws on any failure. */
export async function verifyIdToken(token: string): Promise<SessionUser> {
  const payload = await getVerifier().verify(token);
  return userFromClaims(payload as unknown as Record<string, unknown>);
}

export function userFromClaims(p: Record<string, unknown>): SessionUser {
  const groups = Array.isArray(p["cognito:groups"]) ? (p["cognito:groups"] as unknown[]).map(String) : [];
  const email = typeof p.email === "string" ? p.email : null;
  const name = typeof p.name === "string" ? p.name : null;
  return { sub: String(p.sub), email, name, groups, role: roleFromGroups(groups) };
}
