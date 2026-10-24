import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, buildKey, postConditions, sanitizeFilename, validateUpload } from "@/server/storage/s3";

describe("sanitizeFilename", () => {
  it("strips paths and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\temp\\inv oice (1).pdf")).toBe("inv_oice__1_.pdf");
    expect(sanitizeFilename("..hidden")).toBe("hidden");
    expect(sanitizeFilename("")).toBe("file");
  });
  it("caps length", () => {
    expect(sanitizeFilename("a".repeat(500) + ".pdf").length).toBeLessThanOrEqual(120);
  });
});

describe("buildKey", () => {
  it("namespaces by asset and never trusts the client filename", () => {
    const k = buildKey("asset-1", "../x.pdf", "uuid-1");
    expect(k).toBe("assets/asset-1/uuid-1-x.pdf");
  });
});

describe("validateUpload", () => {
  it("accepts an allowed type within the limit", () => {
    expect(() => validateUpload("application/pdf", 1024)).not.toThrow();
  });
  it("rejects disallowed types, empty files and oversize files", () => {
    expect(() => validateUpload("application/x-msdownload", 1024)).toThrow(/not allowed/);
    expect(() => validateUpload("text/html", 10)).toThrow(/not allowed/);
    expect(() => validateUpload("application/pdf", 0)).toThrow(/empty/);
    expect(() => validateUpload("application/pdf", MAX_UPLOAD_BYTES + 1)).toThrow(/limit/);
  });
});

describe("postConditions", () => {
  it("pins size range, content type and key", () => {
    const c = postConditions("assets/a/b-c.pdf", "application/pdf");
    expect(c).toContainEqual(["content-length-range", 1, MAX_UPLOAD_BYTES]);
    expect(c).toContainEqual(["eq", "$Content-Type", "application/pdf"]);
    expect(c).toContainEqual(["eq", "$key", "assets/a/b-c.pdf"]);
  });
});
