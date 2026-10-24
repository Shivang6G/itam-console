import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { run, db } from "@/server/context";
import { auditLog } from "@/server/db/schema";

export const listAudit = createServerFn({ method: "GET" }).handler(() =>
  run("audit.list", "audit:view", async () => {
      const rows = await db().select().from(auditLog).orderBy(desc(auditLog.at)).limit(200);
      // jsonb has no serialisable static type; ship the diff as a string.
      return rows.map((r) => ({ ...r, diff: r.diff == null ? null : JSON.stringify(r.diff) }));
    }),
);
