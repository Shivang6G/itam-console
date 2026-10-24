import { getDb } from "@/server/db";
import { assets, licenses, tickets } from "@/server/db/schema";
import { logger } from "@/server/logger";

/** Demo data for a fresh environment. Safe to run once; refuses if assets already exist. */
export async function runSeed(): Promise<{ seeded: boolean }> {
  const db = getDb();
  const existing = await db.select({ id: assets.id }).from(assets).limit(1);
  if (existing.length) {
    logger.info("seed_skipped_existing_data");
    return { seeded: false };
  }
  const in90 = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  const inserted = await db
    .insert(assets)
    .values([
      { name: "ThinkPad X1 Carbon G11", serial: "PF3XK9A2", category: "laptop", status: "assigned", assignedTo: "Ravi Sharma", location: "HQ · 4F", warrantyEnd: in90(400) },
      { name: "MacBook Pro 14 M3", serial: "C02ZK1LMQ6L4", category: "laptop", status: "assigned", assignedTo: "Priya Nair", location: "HQ · 3F", warrantyEnd: in90(25) },
      { name: "Dell PowerEdge R650", serial: "SVR-DL650-01", category: "server", status: "in_stock", location: "DC · Rack 12", warrantyEnd: in90(500) },
      { name: "Cisco Catalyst 9200", serial: "FOC2412X0KL", category: "switch", status: "in_repair", location: "DC · Rack 3", warrantyEnd: in90(5) },
      { name: "HP LaserJet Pro M404", serial: "VNC4H12093", category: "printer", status: "assigned", assignedTo: "Front Desk", location: "HQ · Lobby", warrantyEnd: in90(120) },
      { name: "Dell U2723QE Monitor", serial: "MON-U27-014", category: "monitor", status: "in_stock", location: "Store room" },
      { name: "iPhone 15 Pro", serial: "F2LWK3JXQ1", category: "mobile", status: "assigned", assignedTo: "Sales", location: "Field" },
      { name: "Logitech MX Keys", serial: "KB-MXK-221", category: "keyboard", status: "retired", location: "Disposed" },
    ])
    .returning();
  await db.insert(licenses).values([
    { product: "Adobe Creative Cloud", vendor: "Adobe", seatsTotal: 25, seatsUsed: 22, cost: "18000.00", expiresOn: in90(12) },
    { product: "JetBrains All Products", vendor: "JetBrains", seatsTotal: 15, seatsUsed: 11, cost: "9000.00", expiresOn: in90(19) },
    { product: "Microsoft 365 E3", vendor: "Microsoft", seatsTotal: 120, seatsUsed: 108, cost: "96000.00", expiresOn: in90(200) },
    { product: "Zoom Workplace", vendor: "Zoom", seatsTotal: 80, seatsUsed: 64, expiresOn: in90(300) },
  ]);
  const byName = (n: string) => inserted.find((a) => a.name.startsWith(n))?.id ?? null;
  await db.insert(tickets).values([
    { title: "Battery drains within 2 hours of unplug", priority: "high", status: "in_progress", assetId: byName("ThinkPad"), raisedBy: "seed", raisedByName: "Ravi Sharma", assignedTo: "N. Iyer" },
    { title: "Port 12 stuck in err-disabled", priority: "critical", status: "open", assetId: byName("Cisco"), raisedBy: "seed", raisedByName: "NetOps" },
    { title: "External display flickers on HDMI", priority: "medium", status: "open", assetId: byName("MacBook"), raisedBy: "seed", raisedByName: "Priya Nair" },
    { title: "Paper jam recurring at tray 2", priority: "low", status: "resolved", assetId: byName("HP"), raisedBy: "seed", raisedByName: "Front Desk" },
  ]);
  logger.info("seed_done");
  return { seeded: true };
}
