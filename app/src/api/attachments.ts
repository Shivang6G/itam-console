import { createServerFn } from "@tanstack/react-start";
import { v } from "@/lib/validate";
import { eq } from "drizzle-orm";
import { idInput, uploadConfirm, uploadRequest } from "@/lib/schemas";
import { audit, db, run } from "@/server/context";
import { assets, attachments } from "@/server/db/schema";
import {
  MAX_UPLOAD_BYTES,
  buildKey,
  createDownloadUrl,
  createUploadForm,
  deleteObjects,
  objectSize,
  sanitizeFilename,
  validateUpload,
} from "@/server/storage/s3";

/** Step 1: ask for permission to upload. Returns a presigned POST form (10 MB, 5 min, exact type). */
export const requestUpload = createServerFn({ method: "POST" })
  .validator(v(uploadRequest))
  .handler(({ data }) =>
    run("attachments.request", "attachment:upload", async () => {
      validateUpload(data.contentType, data.sizeBytes);
      const [asset] = await db().select({ id: assets.id }).from(assets).where(eq(assets.id, data.assetId));
      if (!asset) throw new Error("Asset not found");
      const key = buildKey(data.assetId, data.filename);
      const form = await createUploadForm(key, data.contentType);
      return { key, url: form.url, fields: form.fields, maxBytes: MAX_UPLOAD_BYTES };
    }),
  );

/** Step 3: browser says it uploaded. We verify the object really exists before recording it. */
export const confirmUpload = createServerFn({ method: "POST" })
  .validator(v(uploadConfirm))
  .handler(({ data }) =>
    run("attachments.confirm", "attachment:upload", (user) =>
      db().transaction(async (tx) => {
        if (!data.key.startsWith(`assets/${data.assetId}/`)) throw new Error("Invalid key for this asset");
        const size = await objectSize(data.key);
        if (size === null) throw new Error("Upload not found in storage");
        const [row] = await tx
          .insert(attachments)
          .values({
            assetId: data.assetId,
            s3Key: data.key,
            filename: sanitizeFilename(data.filename),
            contentType: data.contentType,
            sizeBytes: size,
            uploadedBy: user!.sub,
          })
          .returning();
        await audit(tx, user!, "attachment.add", "asset", data.assetId, { filename: row.filename, sizeBytes: size });
        return row;
      }),
    ),
  );

export const getDownloadUrl = createServerFn({ method: "GET" })
  .validator(v(idInput))
  .handler(({ data }) =>
    run("attachments.download", "view", async () => {
      const [row] = await db().select().from(attachments).where(eq(attachments.id, data.id));
      if (!row) throw new Error("Attachment not found");
      return { url: await createDownloadUrl(row.s3Key, row.filename) };
    }),
  );

export const deleteAttachment = createServerFn({ method: "POST" })
  .validator(v(idInput))
  .handler(({ data }) =>
    run("attachments.delete", "asset:delete", (user) =>
      db().transaction(async (tx) => {
        const [row] = await tx.delete(attachments).where(eq(attachments.id, data.id)).returning();
        if (!row) throw new Error("Attachment not found");
        await audit(tx, user!, "attachment.delete", "asset", row.assetId, { filename: row.filename });
        queueMicrotask(() => void deleteObjects([row.s3Key]));
        return { id: row.id };
      }),
    ),
  );
