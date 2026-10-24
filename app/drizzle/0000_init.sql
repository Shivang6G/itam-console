CREATE TYPE "public"."asset_category" AS ENUM('laptop', 'server', 'switch', 'printer', 'monitor', 'mobile', 'keyboard', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('in_stock', 'assigned', 'in_repair', 'retired');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE SEQUENCE "public"."asset_tag_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "alert_log" (
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"threshold" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_log_entity_entity_id_threshold_pk" PRIMARY KEY("entity","entity_id","threshold")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_tag" text DEFAULT 'AST-' || lpad(nextval('asset_tag_seq')::text, 6, '0') NOT NULL,
	"name" text NOT NULL,
	"category" "asset_category" DEFAULT 'other' NOT NULL,
	"status" "asset_status" DEFAULT 'in_stock' NOT NULL,
	"assigned_to" text,
	"location" text,
	"purchase_date" date,
	"warranty_end" date,
	"notes" text,
	"serial" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_asset_tag_unique" UNIQUE("asset_tag")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_sub" text NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product" text NOT NULL,
	"vendor" text,
	"seats_total" integer DEFAULT 1 NOT NULL,
	"seats_used" integer DEFAULT 0 NOT NULL,
	"cost" numeric(12, 2),
	"expires_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"role_cache" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_no" serial NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"asset_id" uuid,
	"raised_by" text NOT NULL,
	"raised_by_name" text,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "tickets_ticket_no_unique" UNIQUE("ticket_no")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_assigned_to_idx" ON "assets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "assets_warranty_end_idx" ON "assets" USING btree ("warranty_end");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_source_external_uidx" ON "assets" USING btree ("source","external_id") WHERE "assets"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id","at" desc);--> statement-breakpoint
CREATE INDEX "licenses_expires_on_idx" ON "licenses" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "tickets_status_priority_idx" ON "tickets" USING btree ("status","priority");