import { createFileRoute } from "@tanstack/react-router";

// Shallow by default: the ALB and ECS must not kill healthy tasks because the
// database blipped. `?deep=1` also checks the database, for humans and smoke tests.
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deep = new URL(request.url).searchParams.get("deep") === "1";
        if (!deep) return Response.json({ status: "ok" });
        try {
          const { pingDb } = await import("@/server/db");
          await pingDb();
          return Response.json({ status: "ok", db: "ok" });
        } catch (err) {
          return Response.json({ status: "degraded", db: "down", error: (err as Error).message }, { status: 503 });
        }
      },
    },
  },
});
