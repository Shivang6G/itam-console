import { DescribeInstancesCommand, EC2Client, type Instance } from "@aws-sdk/client-ec2";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { assets } from "@/server/db/schema";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

export function assetFromInstance(i: Instance): typeof assets.$inferInsert | null {
  if (!i.InstanceId) return null;
  const tags = Object.fromEntries((i.Tags ?? []).map((t) => [t.Key ?? "", t.Value ?? ""]));
  const state = i.State?.Name;
  return {
    name: tags.Name || i.InstanceId,
    category: "server",
    status: state === "terminated" || state === "shutting-down" ? "retired" : "assigned",
    serial: i.InstanceId,
    location: `${i.Placement?.AvailabilityZone ?? env().AWS_REGION} · ${i.InstanceType ?? "?"}`,
    notes: `Discovered from EC2. State: ${state ?? "unknown"}.`,
    source: "aws-ec2",
    externalId: i.InstanceId,
  };
}

/** Read-only inventory sync: upserts EC2 instances as assets (idempotent on source+external_id). */
export async function runDiscovery(): Promise<{ upserted: number }> {
  const ec2 = new EC2Client({ region: env().AWS_REGION });
  const db = getDb();
  let token: string | undefined;
  let upserted = 0;
  do {
    const res = await ec2.send(new DescribeInstancesCommand({ NextToken: token, MaxResults: 100 }));
    const rows = (res.Reservations ?? []).flatMap((r) => r.Instances ?? []).map(assetFromInstance).filter((x): x is NonNullable<typeof x> => !!x);
    for (const row of rows) {
      await db
        .insert(assets)
        .values(row)
        .onConflictDoUpdate({
          target: [assets.source, assets.externalId],
          targetWhere: sql`${assets.externalId} is not null`,
          set: { name: row.name, status: row.status, location: row.location, notes: row.notes, updatedAt: sql`now()` },
        });
      upserted++;
    }
    token = res.NextToken;
  } while (token);
  logger.info({ upserted }, "discovery_done");
  return { upserted };
}
