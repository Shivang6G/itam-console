import { createServerFn } from "@tanstack/react-start";
import { v } from "@/lib/validate";
import { ilike, or } from "drizzle-orm";
import { searchInput } from "@/lib/schemas";
import { run, db } from "@/server/context";
import { assets, licenses, tickets } from "@/server/db/schema";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const searchAll = createServerFn({ method: "GET" })
  .validator(v(searchInput))
  .handler(({ data }) =>
    run("search", "view", async () => {
      const like = `%${escapeLike(data.q)}%`;
      const [a, t, l] = await Promise.all([
        db().select({ id: assets.id, name: assets.name, assetTag: assets.assetTag }).from(assets)
          .where(or(ilike(assets.name, like), ilike(assets.assetTag, like), ilike(assets.serial, like))).limit(5),
        db().select({ id: tickets.id, ticketNo: tickets.ticketNo, title: tickets.title }).from(tickets)
          .where(ilike(tickets.title, like)).limit(5),
        db().select({ id: licenses.id, product: licenses.product }).from(licenses)
          .where(or(ilike(licenses.product, like), ilike(licenses.vendor, like))).limit(5),
      ]);
      return { assets: a, tickets: t, licenses: l };
    }),
  );
