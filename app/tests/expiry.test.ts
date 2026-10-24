import { describe, expect, it } from "vitest";
import { formatAlert, thresholdToSend } from "@/worker/jobs/expiry-alerts";

describe("thresholdToSend", () => {
  it("sends nothing outside the 30-day window", () => {
    expect(thresholdToSend(45, [])).toBeNull();
  });
  it("sends the 30-day alert first", () => {
    expect(thresholdToSend(30, [])).toBe(30);
    expect(thresholdToSend(25, [])).toBe(30);
  });
  it("sends the tightest uncrossed threshold only once", () => {
    expect(thresholdToSend(13, [30])).toBe(14);
    expect(thresholdToSend(13, [30, 14])).toBeNull();
    expect(thresholdToSend(6, [30, 14])).toBe(7);
    expect(thresholdToSend(6, [7])).toBeNull();
  });
  it("collapses a missed run into the tightest alert, not three", () => {
    expect(thresholdToSend(6, [])).toBe(7);
  });
  it("ignores expired items", () => {
    expect(thresholdToSend(-1, [])).toBeNull();
  });
});

describe("formatAlert", () => {
  it("produces a readable summary", () => {
    const { subject, message } = formatAlert([
      { entity: "license", entityId: "1", label: "Adobe CC", expiresOn: "2026-11-01", daysLeft: 1, threshold: 7 },
      { entity: "asset_warranty", entityId: "2", label: "Dell R650 (AST-000003)", expiresOn: "2026-11-20", daysLeft: 20, threshold: 30 },
    ]);
    expect(subject).toBe("ITAM: 2 items expiring soon");
    expect(message).toContain("License: Adobe CC expires 2026-11-01 (1 day left)");
    expect(message).toContain("Warranty: Dell R650 (AST-000003)");
  });
});
