import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "@/server/csrf";

const base = { allowedOrigin: "https://app.example.com", secFetchSite: null as string | null };
describe("isCrossSiteWrite", () => {
  it("never blocks safe methods", () => {
    expect(isCrossSiteWrite({ ...base, method: "GET", origin: "https://evil.com" })).toBe(false);
  });
  it("blocks a POST from another origin", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: "https://evil.com" })).toBe(true);
  });
  it("allows a POST from our own origin", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: "https://app.example.com" })).toBe(false);
  });
  it("without Origin, falls back to Sec-Fetch-Site", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: null, secFetchSite: "cross-site" })).toBe(true);
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: null, secFetchSite: "same-origin" })).toBe(false);
  });
  it("allows non-browser clients that send neither header", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: null })).toBe(false);
  });
});
