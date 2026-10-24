// Runs only when a Postgres is reachable via DB_* env vars (CI provides one; locally: `docker compose up -d db`).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

const enabled = !!process.env.DB_HOST;

describe.skipIf(!enabled)("database (real Postgres)", () => {
  let mod: typeof import("@/server/db");
  let schema: typeof import("@/server/db/schema");
  const APP = "itam_app_test";

  beforeAll(async () => {
    process.env.DB_SSL = "off";
    process.env.MIGRATIONS_DIR = path.resolve(__dirname, "../drizzle");
    process.env.APP_DB_USER = APP;
    process.env.APP_DB_PASSWORD = "pw_test_123";
    mod = await import("@/server/db");
    schema = await import("@/server/db/schema");
    const { runMigrations } = await import("@/server/db/migrate");
    await mod.getDb().execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await runMigrations();
  });
  afterAll(async () => {
    await mod?.closeDb();
  });

  it("migrations are idempotent", async () => {
    const { runMigrations } = await import("@/server/db/migrate");
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it("generates asset tags from the sequence", async () => {
    const db = mod.getDb();
    const [a] = await db.insert(schema.assets).values({ name: "A" }).returning();
    const [b] = await db.insert(schema.assets).values({ name: "B" }).returning();
    expect(a.assetTag).toMatch(/^AST-\d{6}$/);
    expect(b.assetTag).not.toBe(a.assetTag);
  });

  it("discovery upsert is idempotent on (source, external_id)", async () => {
    const { assetFromInstance } = await import("@/worker/jobs/discover-aws");
    const row = assetFromInstance({ InstanceId: "i-abc", InstanceType: "t3.micro", Tags: [{ Key: "Name", Value: "web-1" }], State: { Name: "running" } })!;
    const db = mod.getDb();
    for (let i = 0; i < 2; i++) {
      await db.insert(schema.assets).values(row).onConflictDoUpdate({
        target: [schema.assets.source, schema.assets.externalId],
        targetWhere: sql`${schema.assets.externalId} is not null`,
        set: { name: row.name },
      });
    }
    const rows = await db.select().from(schema.assets).where(sql`${schema.assets.externalId} = 'i-abc'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("aws-ec2");
  });

  it("alert_log rejects a duplicate (entity, id, threshold)", async () => {
    const db = mod.getDb();
    await db.insert(schema.alertLog).values({ entity: "license", entityId: "L1", threshold: 7 });
    await db.insert(schema.alertLog).values({ entity: "license", entityId: "L1", threshold: 7 }).onConflictDoNothing();
    const rows = await db.select().from(schema.alertLog);
    expect(rows).toHaveLength(1);
  });

  it("the application role can read/write data but not change the schema", async () => {
    const pg = (await import("pg")).default;
    const c = new pg.Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432), database: process.env.DB_NAME, user: APP, password: "pw_test_123" });
    await c.connect();
    try {
      await c.query("insert into licenses (product) values ('x')");
      await expect(c.query("create table nope(i int)")).rejects.toThrow(/permission denied/);
      await expect(c.query("drop table licenses")).rejects.toThrow(/must be owner/);
      await expect(c.query("select * from drizzle.__drizzle_migrations")).rejects.toThrow(/permission denied/);
    } finally {
      await c.end();
    }
  });
});
