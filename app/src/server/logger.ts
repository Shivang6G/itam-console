import pino from "pino";

// One JSON object per line: level, msg, time and whatever fields the caller adds
// (requestId, userSub, route, ms). CloudWatch Logs Insights parses these natively.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "itam" },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "msg",
});

export type Logger = typeof logger;
