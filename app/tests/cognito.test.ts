import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { authorizeUrl, base64url, newPkce, userFromClaims } from "@/server/auth/cognito";

beforeAll(() => {
  process.env.DB_HOST ??= "localhost";
  process.env.DB_NAME ??= "itam";
  process.env.DB_USER ??= "itam";
  process.env.DB_PASSWORD ??= "test";
  process.env.COGNITO_DOMAIN = "itam-demo.auth.ap-south-1.amazoncognito.com";
  process.env.COGNITO_CLIENT_ID = "client123";
  process.env.PUBLIC_BASE_URL = "https://d111.cloudfront.net/";
});

describe("PKCE", () => {
  it("challenge is base64url(sha256(verifier))", () => {
    const { verifier, challenge, state } = newPkce();
    expect(challenge).toBe(base64url(crypto.createHash("sha256").update(verifier).digest()));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(state.length).toBeGreaterThan(20);
    expect(newPkce().state).not.toBe(state);
  });
});

describe("authorizeUrl", () => {
  it("builds a code+PKCE request with the CloudFront redirect_uri", () => {
    const u = new URL(authorizeUrl("CHAL", "STATE"));
    expect(u.origin).toBe("https://itam-demo.auth.ap-south-1.amazoncognito.com");
    expect(u.pathname).toBe("/oauth2/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://d111.cloudfront.net/auth/callback");
    expect(u.searchParams.get("state")).toBe("STATE");
  });
});

describe("userFromClaims", () => {
  it("reads email, name and the highest group", () => {
    const u = userFromClaims({ sub: "abc", email: "a@b.c", name: "A", "cognito:groups": ["viewer", "technician"] });
    expect(u).toMatchObject({ sub: "abc", email: "a@b.c", name: "A", role: "technician" });
  });
  it("yields no role when there are no groups", () => {
    expect(userFromClaims({ sub: "x" }).role).toBeNull();
  });
});
