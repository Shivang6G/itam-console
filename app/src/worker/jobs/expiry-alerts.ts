import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { sql } from "drizzle-orm";
import { ALERT_THRESHOLDS_DAYS } from "@/lib/constants";
import { getDb } from "@/server/db";
import { alertLog } from "@/server/db/schema";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

export interface Expiring {
  entity: "license" | "asset_warranty";
  entityId: string;
  label: string;
  expiresOn: string; // YYYY-MM-DD
  daysLeft: number;
}

/**
 * The tightest threshold an item has crossed and not yet been alerted for.
 * An item 6 days out has crossed 30, 14 and 7; we send only the "7" alert,
 * and only if "7" is not already in alertLog.
 */
export function thresholdToSend(daysLeft: number, alreadySent: readonly number[]): number | null {
  if (daysLeft < 0) return null; // already expired: not an upcoming-expiry alert
  const crossed = ALERT_THRESHOLDS_DAYS.filter((t) => daysLeft <= t);
  if (crossed.length === 0) return null;
  const tightest = Math.min(...crossed);
  return alreadySent.includes(tightest) ? null : tightest;
}

export function formatAlert(items: Array<Expiring & { threshold: number }>): { subject: string; message: string } {
  const lines = items.map(
    (i) => `• ${i.entity === "license" ? "License" : "Warranty"}: ${i.label} expires ${i.expiresOn} (${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"} left)`,
  );
  return {
    subject: `ITAM: ${items.length} item${items.length === 1 ? "" : "s"} expiring soon`,
    message: ["The following items are approaching expiry:", "", ...lines, "", "Sign in to the ITAM Console to renew or replace them."].join("\n"),
  };
}

async function findExpiring(): Promise<Expiring[]> {
  const db = getDb();
  const max = Math.max(...ALERT_THRESHOLDS_DAYS);
  const lic = await db.execute<{ id: string; product: string; expires_on: string; days: number }>(sql`
    select id, product, expires_on::text as expires_on, (expires_on - current_date)::int as days
    from licenses where expires_on is not null and expires_on >= current_date and expires_on <= current_date + ${max}::int`);
  const war = await db.execute<{ id: string; name: string; asset_tag: string; warranty_end: string; days: number }>(sql`
    select id, name, asset_tag, warranty_end::text as warranty_end, (warranty_end - current_date)::int as days
    from assets where warranty_end is not null and status <> 'retired' and warranty_end >= current_date and warranty_end <= current_date + ${max}::int`);
  return [
    ...lic.rows.map((r) => ({ entity: "license" as const, entityId: r.id, label: r.product, expiresOn: r.expires_on, daysLeft: r.days })),
    ...war.rows.map((r) => ({ entity: "asset_warranty" as const, entityId: r.id, label: `${r.name} (${r.asset_tag})`, expiresOn: r.warranty_end, daysLeft: r.days })),
  ];
}

export async function runExpiryAlerts(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  const found = await findExpiring();
  const sentRows = await db.select().from(alertLog);
  const sentMap = new Map<string, number[]>();
  for (const r of sentRows) {
    const k = `${r.entity}:${r.entityId}`;
    sentMap.set(k, [...(sentMap.get(k) ?? []), r.threshold]);
  }

  const toSend: Array<Expiring & { threshold: number }> = [];
  for (const item of found) {
    const t = thresholdToSend(item.daysLeft, sentMap.get(`${item.entity}:${item.entityId}`) ?? []);
    if (t !== null) toSend.push({ ...item, threshold: t });
  }
  if (toSend.length === 0) {
    logger.info({ found: found.length }, "expiry_alerts_nothing_to_send");
    return { sent: 0, skipped: found.length };
  }

  const topic = env().ALERT_TOPIC_ARN;
  if (!topic) throw new Error("ALERT_TOPIC_ARN is not set");
  const { subject, message } = formatAlert(toSend);
  await new SNSClient({ region: env().AWS_REGION }).send(new PublishCommand({ TopicArn: topic, Subject: subject.slice(0, 100), Message: message }));

  // Record only after SNS accepted the message, so a failed publish is retried next run.
  await db
    .insert(alertLog)
    .values(toSend.map((i) => ({ entity: i.entity, entityId: i.entityId, threshold: i.threshold })))
    .onConflictDoNothing();
  logger.info({ sent: toSend.length }, "expiry_alerts_sent");
  return { sent: toSend.length, skipped: found.length - toSend.length };
}
