import { createServerFn } from "@tanstack/react-start";
import { v } from "@/lib/validate";
import { desc, eq, sql } from "drizzle-orm";
import { assetInput, assetUpdate, idInput } from "@/lib/schemas";
import { audit, db, diffOf, run } from "@/server/context";
import { assets, attachments } from "@/server/db/schema";
import { deleteObjects } from "@/server/storage/s3";

export const listAssets = createServerFn({ method: "GET" }).handler(() =>
  run("assets.list", "view", async () => {
    return db().select().from(assets).orderBy(desc(assets.createdAt)).limit(1000);
  }),
);

export const getAsset = createServerFn({ method: "GET" })
  .validator(v(idInput))
  .handler(({ data }) =>
    run("assets.get", "view", async () => {
      const [asset] = await db().select().from(assets).where(eq(assets.id, data.id));
      if (!asset) throw new Error("Asset not found");
      const files = await db().select().from(attachments).where(eq(attachments.assetId, data.id)).orderBy(desc(attachments.createdAt));
      return { asset, attachments: files };
    }),
  );

export const createAsset = createServerFn({ method: "POST" })
  .validator(v(assetInput))
  .handler(({ data }) =>
    run("assets.create", "asset:write", (user) =>
      db().transaction(async (tx) => {
        const [row] = await tx
          .insert(assets)
          .values({
            ...data,
            assetTag: data.assetTag ?? undefined, // undefined lets the DB sequence generate AST-000001
            createdBy: user!.sub,
          })
          .returning();
        await audit(tx, user!, "asset.create", "asset", row.id, { name: row.name, assetTag: row.assetTag });
        return row;
      }),
    ),
  );

export const updateAsset = createServerFn({ method: "POST" })
  .validator(v(assetUpdate))
  .handler(({ data }) =>
    run("assets.update", "asset:write", (user) =>
      db().transaction(async (tx) => {
        const [before] = await tx.select().from(assets).where(eq(assets.id, data.id)).for("update");
        if (!before) throw new Error("Asset not found");
        const { assetTag, ...rest } = data.data;
        const [row] = await tx
          .update(assets)
          .set({ ...rest, ...(assetTag ? { assetTag } : {}), updatedAt: sql`now()` })
          .where(eq(assets.id, data.id))
          .returning();
        await audit(tx, user!, "asset.update", "asset", row.id, diffOf(before, row));
        return row;
      }),
    ),
  );

export const deleteAsset = createServerFn({ method: "POST" })
  .validator(v(idInput))
  .handler(({ data }) =>
    run("assets.delete", "asset:delete", (user) =>
      db().transaction(async (tx) => {
        const files = await tx.select({ key: attachments.s3Key }).from(attachments).where(eq(attachments.assetId, data.id));
        const [row] = await tx.delete(assets).where(eq(assets.id, data.id)).returning();
        if (!row) throw new Error("Asset not found");
        await audit(tx, user!, "asset.delete", "asset", row.id, { name: row.name, assetTag: row.assetTag });
        // After the DB commit succeeds (best effort, bucket is versioned).
        queueMicrotask(() => void deleteObjects(files.map((f) => f.key)));
        return { id: row.id };
      }),
    ),
  );

