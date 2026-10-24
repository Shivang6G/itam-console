import { createServerFn } from "@tanstack/react-start";
import { v } from "@/lib/validate";
import { asc, eq, sql } from "drizzle-orm";
import { idInput, licenseInput, licenseUpdate } from "@/lib/schemas";
import { audit, db, diffOf, run } from "@/server/context";
import { licenses } from "@/server/db/schema";

export const listLicenses = createServerFn({ method: "GET" }).handler(() =>
  run("licenses.list", "view", async () => {
    return db().select().from(licenses).orderBy(sql`${licenses.expiresOn} asc nulls last`, asc(licenses.product));
  }),
);

export const createLicense = createServerFn({ method: "POST" })
  .validator(v(licenseInput))
  .handler(({ data }) =>
    run("licenses.create", "license:manage", (user) =>
      db().transaction(async (tx) => {
        const [row] = await tx.insert(licenses).values(data).returning();
        await audit(tx, user!, "license.create", "license", row.id, { product: row.product, seatsTotal: row.seatsTotal });
        return row;
      }),
    ),
  );

export const updateLicense = createServerFn({ method: "POST" })
  .validator(v(licenseUpdate))
  .handler(({ data }) =>
    run("licenses.update", "license:manage", (user) =>
      db().transaction(async (tx) => {
        const [before] = await tx.select().from(licenses).where(eq(licenses.id, data.id)).for("update");
        if (!before) throw new Error("License not found");
        const [row] = await tx.update(licenses).set(data.data).where(eq(licenses.id, data.id)).returning();
        await audit(tx, user!, "license.update", "license", row.id, diffOf(before, row));
        return row;
      }),
    ),
  );

export const deleteLicense = createServerFn({ method: "POST" })
  .validator(v(idInput))
  .handler(({ data }) =>
    run("licenses.delete", "license:manage", (user) =>
      db().transaction(async (tx) => {
        const [row] = await tx.delete(licenses).where(eq(licenses.id, data.id)).returning();
        if (!row) throw new Error("License not found");
        await audit(tx, user!, "license.delete", "license", row.id, { product: row.product });
        return { id: row.id };
      }),
    ),
  );
