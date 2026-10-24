import { describe, expect, it } from "vitest";
import { assetInput, licenseInput, ticketInput } from "@/lib/schemas";

describe("assetInput", () => {
  it("normalises blanks to null and applies defaults", () => {
    const r = assetInput.parse({ name: "  Laptop ", serial: "", assignedTo: "  " });
    expect(r.name).toBe("Laptop");
    expect(r.serial).toBeNull();
    expect(r.assignedTo).toBeNull();
    expect(r.category).toBe("other");
    expect(r.status).toBe("in_stock");
  });
  it("rejects an empty name, bad enum and bad date", () => {
    expect(assetInput.safeParse({ name: "" }).success).toBe(false);
    expect(assetInput.safeParse({ name: "x", status: "lost" }).success).toBe(false);
    expect(assetInput.safeParse({ name: "x", warrantyEnd: "01/02/2027" }).success).toBe(false);
  });
});

describe("licenseInput", () => {
  it("coerces numeric strings from form inputs", () => {
    const r = licenseInput.parse({ product: "P", seatsTotal: "10", seatsUsed: "3", cost: "99.5" });
    expect(r.seatsTotal).toBe(10);
    expect(r.cost).toBe("99.5");
  });
  it("rejects used > total and malformed cost", () => {
    expect(licenseInput.safeParse({ product: "P", seatsTotal: 1, seatsUsed: 2 }).success).toBe(false);
    expect(licenseInput.safeParse({ product: "P", seatsTotal: 1, seatsUsed: 0, cost: "12.345" }).success).toBe(false);
  });
});

describe("ticketInput", () => {
  it("requires a title and defaults priority", () => {
    expect(ticketInput.safeParse({ title: "" }).success).toBe(false);
    expect(ticketInput.parse({ title: "Broken screen" }).priority).toBe("medium");
  });
});
