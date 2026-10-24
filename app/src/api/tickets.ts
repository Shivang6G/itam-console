import { createServerFn } from "@tanstack/react-start";
import { v } from "@/lib/validate";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { ticketInput, ticketUpdate } from "@/lib/schemas";
import { audit, db, diffOf, run } from "@/server/context";
import { assets, tickets } from "@/server/db/schema";

export const listTickets = createServerFn({ method: "GET" }).handler(() =>
  run("tickets.list", "view", async () => {
    return db()
      .select({ ...getTableColumns(tickets), assetName: assets.name, assetTag: assets.assetTag })
      .from(tickets)
      .leftJoin(assets, eq(tickets.assetId, assets.id))
      .orderBy(desc(tickets.ticketNo))
      .limit(1000);
  }),
);

export const createTicket = createServerFn({ method: "POST" })
  .validator(v(ticketInput))
  .handler(({ data }) =>
    run("tickets.create", "ticket:create", (user) =>
      db().transaction(async (tx) => {
        const [row] = await tx
          .insert(tickets)
          .values({ ...data, raisedBy: user!.sub, raisedByName: user!.name ?? user!.email })
          .returning();
        await audit(tx, user!, "ticket.create", "ticket", row.id, { ticketNo: row.ticketNo, title: row.title, priority: row.priority });
        return row;
      }),
    ),
  );

export const updateTicket = createServerFn({ method: "POST" })
  .validator(v(ticketUpdate))
  .handler(({ data }) =>
    run("tickets.update", "ticket:update", (user) =>
      db().transaction(async (tx) => {
        const [before] = await tx.select().from(tickets).where(eq(tickets.id, data.id)).for("update");
        if (!before) throw new Error("Ticket not found");
        const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: sql`now()` as unknown as Date };
        if (data.status) {
          patch.status = data.status;
          patch.closedAt = data.status === "closed" || data.status === "resolved" ? (sql`now()` as unknown as Date) : null;
        }
        if (data.assignedTo !== undefined) patch.assignedTo = data.assignedTo;
        const [row] = await tx.update(tickets).set(patch).where(eq(tickets.id, data.id)).returning();
        await audit(tx, user!, "ticket.update", "ticket", row.id, diffOf(before, row));
        return row;
      }),
    ),
  );
