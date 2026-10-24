import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.string().default("info"),
  AWS_REGION: z.string().default("ap-south-1"),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  // "require" = verify against the RDS CA bundle (default); "off" is only for a local, non-TLS Postgres.
  DB_SSL: z.enum(["require", "off"]).default("require"),

  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_CLIENT_SECRET: z.string().optional(),
  COGNITO_DOMAIN: z.string().optional(), // e.g. itam-demo-123456789012.auth.ap-south-1.amazoncognito.com
  PUBLIC_BASE_URL: z.string().url().optional(), // https://dxxxx.cloudfront.net

  S3_BUCKET: z.string().optional(),
  ALERT_TOPIC_ARN: z.string().optional(),

  // Local development only. Refused when NODE_ENV=production.
  DEV_AUTH: z.enum(["0", "1"]).default("0"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${issues}`);
    }
    if (parsed.data.NODE_ENV === "production" && parsed.data.DEV_AUTH === "1") {
      throw new Error("DEV_AUTH=1 is not allowed when NODE_ENV=production");
    }
    cached = parsed.data;
  }
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env()[key];
  if (v === undefined || v === null || v === "") throw new Error(`Missing required environment variable ${String(key)}`);
  return v as NonNullable<Env[K]>;
}

export function resetEnvCache() {
  cached = undefined;
}
