import { createFileRoute } from "@tanstack/react-router";
import { logoutUrl } from "@/server/auth/cognito";
import { expireCookie, redirect } from "@/server/auth/cookies";
import { env } from "@/server/env";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        const secure = (env().PUBLIC_BASE_URL ?? "").startsWith("https://");
        const cleared = ["itam_id", "itam_rt", "itam_dev", "itam_pkce"].map((n) => expireCookie(n, secure));
        const e = env();
        const target = e.COGNITO_DOMAIN && e.COGNITO_CLIENT_ID && e.PUBLIC_BASE_URL ? logoutUrl() : "/signin";
        return redirect(target, cleared);
      },
    },
  },
});
