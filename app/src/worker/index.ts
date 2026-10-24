import { closeDb } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";
import { logger } from "@/server/logger";

const COMMANDS = ["migrate", "seed", "expiry-alerts", "discover-aws"] as const;
type Command = (typeof COMMANDS)[number];

async function main() {
  const cmd = process.argv[2] as Command | undefined;
  if (!cmd || !COMMANDS.includes(cmd)) {
    console.error(`Usage: worker <${COMMANDS.join("|")}>`);
    process.exit(2);
  }
  logger.info({ cmd }, "worker_start");
  try {
    switch (cmd) {
      case "migrate":
        await runMigrations();
        break;
      case "seed":
        await (await import("./jobs/seed")).runSeed();
        break;
      case "expiry-alerts":
        await (await import("./jobs/expiry-alerts")).runExpiryAlerts();
        break;
      case "discover-aws":
        await (await import("./jobs/discover-aws")).runDiscovery();
        break;
    }
    logger.info({ cmd }, "worker_done");
  } catch (err) {
    logger.error({ cmd, err: (err as Error).message, stack: (err as Error).stack }, "worker_failed");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
