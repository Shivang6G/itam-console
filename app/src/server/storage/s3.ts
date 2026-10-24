import crypto from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, requireEnv } from "../env";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const UPLOAD_EXPIRY_SECONDS = 5 * 60;
export const DOWNLOAD_EXPIRY_SECONDS = 60;

export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 120);
}

/** assets/{assetId}/{uuid}-{filename} */
export function buildKey(assetId: string, filename: string, uuid: string = crypto.randomUUID()): string {
  return `assets/${assetId}/${uuid}-${sanitizeFilename(filename)}`;
}

export function validateUpload(contentType: string, sizeBytes: number): void {
  if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`Content type '${contentType}' is not allowed`);
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new Error("File is empty");
  if (sizeBytes > MAX_UPLOAD_BYTES) throw new Error(`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);
}

type PostConditions = NonNullable<Parameters<typeof createPresignedPost>[1]["Conditions"]>;

export function postConditions(key: string, contentType: string): PostConditions {
  return [
    ["content-length-range", 1, MAX_UPLOAD_BYTES],
    ["eq", "$Content-Type", contentType],
    ["eq", "$key", key],
  ];
}

let client: S3Client | undefined;
function s3(): S3Client {
  if (!client) client = new S3Client({ region: env().AWS_REGION });
  return client;
}

export async function createUploadForm(key: string, contentType: string) {
  return createPresignedPost(s3(), {
    Bucket: requireEnv("S3_BUCKET"),
    Key: key,
    Conditions: postConditions(key, contentType),
    Fields: { "Content-Type": contentType },
    Expires: UPLOAD_EXPIRY_SECONDS,
  });
}

export async function objectSize(key: string): Promise<number | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: requireEnv("S3_BUCKET"), Key: key }));
    return r.ContentLength ?? null;
  } catch {
    return null;
  }
}

export function createDownloadUrl(key: string, filename: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: requireEnv("S3_BUCKET"),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
    }),
    { expiresIn: DOWNLOAD_EXPIRY_SECONDS },
  );
}

import { DeleteObjectCommand } from "@aws-sdk/client-s3";

/** Best effort: the bucket is versioned, so a failed delete never loses the ability to recover. */
export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.allSettled(
    keys.map((Key) => s3().send(new DeleteObjectCommand({ Bucket: requireEnv("S3_BUCKET"), Key }))),
  );
}
