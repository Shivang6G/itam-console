import { z } from "zod";
import { ASSET_STATUSES, CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "./constants";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === "" ? null : v));

const optDate = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD");

export const assetInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.enum(CATEGORIES).default("other"),
  status: z.enum(ASSET_STATUSES).default("in_stock"),
  serial: optText(120),
  assetTag: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : undefined)),
  assignedTo: optText(120),
  location: optText(120),
  purchaseDate: optDate,
  warrantyEnd: optDate,
  notes: optText(2000),
});
export type AssetInput = z.input<typeof assetInput>;

export const assetUpdate = z.object({ id: z.string().uuid(), data: assetInput });

export const ticketInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optText(4000),
  priority: z.enum(TICKET_PRIORITIES).default("medium"),
  assetId: z.string().uuid().nullish().transform((v) => v ?? null),
});
export type TicketInput = z.input<typeof ticketInput>;

export const ticketUpdate = z.object({
  id: z.string().uuid(),
  status: z.enum(TICKET_STATUSES).optional(),
  assignedTo: optText(120).optional(),
});

export const licenseInput = z
  .object({
    product: z.string().trim().min(1, "Product is required").max(200),
    vendor: optText(120),
    seatsTotal: z.coerce.number().int().min(0).max(1_000_000),
    seatsUsed: z.coerce.number().int().min(0).max(1_000_000),
    cost: z
      .union([z.string(), z.number()])
      .nullish()
      .transform((v) => (v === undefined || v === null || v === "" ? null : String(v)))
      .refine((v) => v === null || /^\d+(\.\d{1,2})?$/.test(v), "Use a number with up to 2 decimals"),
    expiresOn: optDate,
    notes: optText(2000),
  })
  .refine((v) => v.seatsUsed <= v.seatsTotal, { message: "Seats used cannot exceed seats total", path: ["seatsUsed"] });
export type LicenseInput = z.input<typeof licenseInput>;

export const licenseUpdate = z.object({ id: z.string().uuid(), data: licenseInput });
export const idInput = z.object({ id: z.string().uuid() });

export const uploadRequest = z.object({
  assetId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(150),
  sizeBytes: z.number().int().positive(),
});
export const uploadConfirm = z.object({
  assetId: z.string().uuid(),
  key: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(150),
});
export const searchInput = z.object({ q: z.string().trim().min(1).max(100) });
