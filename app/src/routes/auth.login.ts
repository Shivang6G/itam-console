import { createFileRoute } from "@tanstack/react-router";
import { authorizeUrl, newPkce } from "@/server/auth/cognito";
import { redirect, serializeCookie } from "@/server/auth/cookies";
import { env } from "@/server/env";

export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: async () => {
        const { verifier, challenge, state } = newPkce();
        const secure = (env().PUBLIC_BASE_URL ?? "").startsWith("https://");
        const pkce = serializeCookie("itam_pkce", JSON.stringify({ state, verifier }), { maxAge: 600, secure });
        return redirect(authorizeUrl(challenge, state), [pkce]);
      },
    },
  },
});
