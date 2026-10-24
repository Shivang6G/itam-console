import { createServerFn } from "@tanstack/react-start";
import { desc, asc, gte, isNotNull, lte, sql, and } from "drizzle-orm";
import { run, db } from "@/server/context";
import { assets, licenses, tickets } from "@/server/db/schema";

export const getDashboard = createServerFn({ method: "GET" }).handler(() =>
  run("dashboard", "view", async () => {
    const d = db();
    const [assetRows, ticketRows, expiring, recent, warranty] = await Promise.all([
      d.select({ status: assets.status, n: sql<number>`count(*)::int` }).from(assets).groupBy(assets.status),
      d.select({ status: tickets.status, n: sql<number>`count(*)::int` }).from(tickets).groupBy(tickets.status),
      d
        .select({ id: licenses.id, product: licenses.product, expiresOn: licenses.expiresOn, seatsUsed: licenses.seatsUsed, seatsTotal: licenses.seatsTotal })
        .from(licenses)
        .where(and(isNotNull(licenses.expiresOn), gte(licenses.expiresOn, sql`current_date`)))
        .orderBy(asc(licenses.expiresOn))
        .limit(5),
      d
        .select({ id: tickets.id, ticketNo: tickets.ticketNo, title: tickets.title, priority: tickets.priority, status: tickets.status, createdAt: tickets.createdAt })
        .from(tickets)
        .orderBy(desc(tickets.createdAt))
        .limit(5),
      d
        .select({ n: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(isNotNull(assets.warrantyEnd), gte(assets.warrantyEnd, sql`current_date`), lte(assets.warrantyEnd, sql`current_date + 30`))),
    ]);
    const a = Object.fromEntries(assetRows.map((r) => [r.status, r.n])) as Record<string, number>;
    const t = Object.fromEntries(ticketRows.map((r) => [r.status, r.n])) as Record<string, number>;
    return {
      assets: {
        total: assetRows.reduce((s, r) => s + r.n, 0),
        in_stock: a.in_stock ?? 0,
        assigned: a.assigned ?? 0,
        in_repair: a.in_repair ?? 0,
        retired: a.retired ?? 0,
      },
      tickets: {
        open: t.open ?? 0,
        in_progress: t.in_progress ?? 0,
        resolved: (t.resolved ?? 0) + (t.closed ?? 0),
      },
      expiringLicenses: expiring,
      recentTickets: recent,
      warrantiesEndingSoon: warranty[0]?.n ?? 0,
    };
  }),
);
