import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const CA_PATHS = [
  process.env.DB_CA_PATH,
  "/app/certs/global-bundle.pem",
  path.resolve(process.cwd(), "certs/global-bundle.pem"),
].filter(Boolean) as string[];

function sslConfig(): pg.PoolConfig["ssl"] {
  if (env().DB_SSL === "off") return false;
  const caPath = CA_PATHS.find((p) => fs.existsSync(p));
  if (!caPath) throw new Error(`RDS CA bundle not found (looked in: ${CA_PATHS.join(", ")})`);
  return { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true };
}

export function createPool(overrides: Partial<pg.PoolConfig> = {}): pg.Pool {
  const e = env();
  const pool = new pg.Pool({
    host: e.DB_HOST,
    port: e.DB_PORT,
    database: e.DB_NAME,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    ssl: sslConfig(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...overrides,
  });
  // An idle client erroring (e.g. RDS failover) must not crash the process.
  pool.on("error", (err) => {
    // logger imported lazily to keep this module cheap to import in scripts
    import("../logger").then(({ logger }) => logger.error({ err: err.message }, "pg_pool_error"));
  });
  return pool;
}

let pool: pg.Pool | undefined;
let db: Db | undefined;

export function getPool(): pg.Pool {
  if (!pool) pool = createPool();
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

export async function pingDb(): Promise<void> {
  await getPool().query("select 1");
}

export { schema };
