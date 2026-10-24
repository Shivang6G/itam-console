export const CATEGORIES = ["laptop", "server", "switch", "printer", "monitor", "mobile", "keyboard", "other"] as const;
export const ASSET_STATUSES = ["in_stock", "assigned", "in_repair", "retired"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type Category = (typeof CATEGORIES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ALERT_THRESHOLDS_DAYS = [30, 14, 7] as const;
