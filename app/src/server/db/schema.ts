import { sql } from "drizzle-orm";
import {
  bigserial,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const assetStatus = pgEnum("asset_status", ["in_stock", "assigned", "in_repair", "retired"]);
export const assetCategory = pgEnum("asset_category", [
  "laptop", "server", "switch", "printer", "monitor", "mobile", "keyboard", "other",
]);
export const ticketStatus = pgEnum("ticket_status", ["open", "in_progress", "resolved", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "medium", "high", "critical"]);

export const assetTagSeq = pgSequence("asset_tag_seq", { startWith: 1 });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // Cognito sub
  email: text("email"),
  fullName: text("full_name"),
  roleCache: text("role_cache"),
  createdAt: createdAt(),
});

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetTag: text("asset_tag")
      .notNull()
      .unique()
      .default(sql`'AST-' || lpad(nextval('asset_tag_seq')::text, 6, '0')`),
    name: text("name").notNull(),
    category: assetCategory("category").notNull().default("other"),
    status: assetStatus("status").notNull().default("in_stock"),
    assignedTo: text("assigned_to"),
    location: text("location"),
    purchaseDate: date("purchase_date"),
    warrantyEnd: date("warranty_end"),
    notes: text("notes"),
    serial: text("serial"),
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assets_assigned_to_idx").on(t.assignedTo),
    index("assets_warranty_end_idx").on(t.warrantyEnd),
    uniqueIndex("assets_source_external_uidx").on(t.source, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNo: serial("ticket_no").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    status: ticketStatus("status").notNull().default("open"),
    priority: ticketPriority("priority").notNull().default("medium"),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    raisedBy: text("raised_by").notNull(),
    raisedByName: text("raised_by_name"),
    assignedTo: text("assigned_to"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("tickets_status_priority_idx").on(t.status, t.priority)],
);

export const licenses = pgTable(
  "licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    product: text("product").notNull(),
    vendor: text("vendor"),
    seatsTotal: integer("seats_total").notNull().default(1),
    seatsUsed: integer("seats_used").notNull().default(0),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    expiresOn: date("expires_on"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("licenses_expires_on_idx").on(t.expiresOn)],
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorSub: text("actor_sub").notNull(),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    diff: jsonb("diff"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId, sql`${t.at} desc`)],
);

export const alertLog = pgTable(
  "alert_log",
  {
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    threshold: integer("threshold").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entity, t.entityId, t.threshold] })],
);

export type Asset = typeof assets.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type License = typeof licenses.$inferSelect;
