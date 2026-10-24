import { createFileRoute } from "@tanstack/react-router";
import { ROLES } from "@/server/auth/roles";
import { redirect, serializeCookie } from "@/server/auth/cookies";
import { devAuthEnabled } from "@/server/auth/session";

// Local development only. devAuthEnabled() is false whenever NODE_ENV=production.
export const Route = createFileRoute("/auth/dev-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!devAuthEnabled()) return new Response("Not found", { status: 404 });
        const form = await request.formData();
        const role = String(form.get("role") ?? "viewer");
        const name = String(form.get("name") ?? "Dev User").slice(0, 80);
        const email = String(form.get("email") ?? "dev@example.com").slice(0, 120);
        const groups = (ROLES as readonly string[]).includes(role) ? [role] : [];
        const payload = { sub: `dev-${email}`, email, name, "cognito:groups": groups };
        const cookie = serializeCookie("itam_dev", Buffer.from(JSON.stringify(payload)).toString("base64url"), { maxAge: 8 * 3600 });
        return redirect("/dashboard", [cookie]);
      },
    },
  },
});
