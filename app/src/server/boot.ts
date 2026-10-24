import { definePlugin } from "nitro";
import { env } from "./env";
import { logger } from "./logger";

// Runs once when the server process starts.
// Fail fast: a mis-configured task must crash at boot (ECS rolls the deployment back),
// not limp along and fail on the first user request.
export default definePlugin(() => {
  try {
    const e = env();
    logger.info({ nodeEnv: e.NODE_ENV, port: e.PORT, db: `${e.DB_HOST}:${e.DB_PORT}/${e.DB_NAME}`, user: e.DB_USER }, "boot");
  } catch (err) {
    logger.fatal({ err: (err as Error).message }, "invalid_configuration");
    process.exit(1);
  }
});
