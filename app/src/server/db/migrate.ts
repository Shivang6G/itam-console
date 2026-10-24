import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { createPool } from "./index";
import { logger } from "../logger";

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Runs SQL migrations as the master user, then (optionally) creates the
 * restricted application role. The app never connects as the master user.
 */
export async function runMigrations(): Promise<void> {
  const pool = createPool({ max: 1 });
  try {
    const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
    logger.info({ folder }, "migrate_start");
    await migrate(drizzle(pool), { migrationsFolder: folder });
    logger.info("migrate_schema_done");

    const appUser = process.env.APP_DB_USER;
    const appPassword = process.env.APP_DB_PASSWORD;
    if (appUser && appPassword) {
      await ensureAppRole(pool, appUser, appPassword);
    } else {
      logger.warn("migrate_no_app_role: APP_DB_USER/APP_DB_PASSWORD not set, skipping role setup");
    }
  } finally {
    await pool.end();
  }
}

async function ensureAppRole(pool: ReturnType<typeof createPool>, user: string, password: string) {
  if (!IDENT.test(user)) throw new Error(`Invalid APP_DB_USER identifier: ${user}`);
  const client = await pool.connect();
  try {
    const exists = await client.query("select 1 from pg_roles where rolname = $1", [user]);
    // Identifiers cannot be bound as parameters, so the name is validated above;
    // the password is passed through format() with %L (literal quoting) server-side.
    if (exists.rowCount === 0) {
      await client.query(`select format('create role %I login password %L', $1::text, $2::text) as stmt`, [user, password])
        .then((r) => client.query(r.rows[0].stmt));
    } else {
      await client.query(`select format('alter role %I with login password %L', $1::text, $2::text) as stmt`, [user, password])
        .then((r) => client.query(r.rows[0].stmt));
    }
    const db = (await client.query("select current_database() as d")).rows[0].d as string;
    await client.query(`grant connect on database "${db.replace(/"/g, '""')}" to ${user}`);
    await client.query(`grant usage on schema public to ${user}`);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${user}`);
    await client.query(`grant usage, select on all sequences in schema public to ${user}`);
    // The app role may not alter the schema or touch the migration bookkeeping table.
    await client.query(`revoke all on schema drizzle from ${user}`).catch(() => undefined);
    await client.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${user}`);
    await client.query(`alter default privileges in schema public grant usage, select on sequences to ${user}`);
    logger.info({ user }, "migrate_app_role_ready");
  } finally {
    client.release();
  }
}
