import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { exchangeCode, verifyIdToken } from "@/server/auth/cognito";
import { expireCookie, parseCookies, redirect, serializeCookie } from "@/server/auth/cookies";
import { getDb } from "@/server/db";
import { profiles } from "@/server/db/schema";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secure = (env().PUBLIC_BASE_URL ?? "").startsWith("https://");
        const fail = (reason: string) =>
          redirect(`/signin?error=${encodeURIComponent(reason)}`, [expireCookie("itam_pkce", secure)]);

        const cognitoError = url.searchParams.get("error");
        if (cognitoError) return fail(url.searchParams.get("error_description") ?? cognitoError);

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookies = parseCookies(request.headers.get("cookie"));
        let pkce: { state: string; verifier: string } | null = null;
        try {
          pkce = cookies.itam_pkce ? JSON.parse(cookies.itam_pkce) : null;
        } catch {
          pkce = null;
        }
        if (!code || !state || !pkce || pkce.state !== state) return fail("Sign-in session expired. Please try again.");

        try {
          const tokens = await exchangeCode(code, pkce.verifier);
          const user = await verifyIdToken(tokens.id_token);
          await getDb()
            .insert(profiles)
            .values({ id: user.sub, email: user.email, fullName: user.name, roleCache: user.role })
            .onConflictDoUpdate({ target: profiles.id, set: { email: user.email, fullName: user.name, roleCache: user.role } });
          void eq;
          logger.info({ userSub: user.sub, role: user.role }, "sign_in");
          const out = [
            serializeCookie("itam_id", tokens.id_token, { maxAge: Math.max(60, tokens.expires_in), secure }),
            expireCookie("itam_pkce", secure),
          ];
          if (tokens.refresh_token) out.push(serializeCookie("itam_rt", tokens.refresh_token, { maxAge: 60 * 60 * 24 * 30, secure }));
          return redirect("/dashboard", out);
        } catch (err) {
          logger.error({ err: (err as Error).message }, "sign_in_failed");
          return fail("Sign-in failed. Please try again.");
        }
      },
    },
  },
});
