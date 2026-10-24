import { describe, expect, it } from "vitest";
import { can, HttpError, requirePermission, roleFromGroups, type Permission, type SessionUser } from "@/server/auth/roles";

describe("roleFromGroups", () => {
  it("returns the highest privilege among known groups", () => {
    expect(roleFromGroups(["viewer", "admin", "technician"])).toBe("admin");
    expect(roleFromGroups(["viewer", "technician"])).toBe("technician");
  });
  it("ignores unknown groups and missing claims", () => {
    expect(roleFromGroups(["finance"])).toBeNull();
    expect(roleFromGroups([])).toBeNull();
    expect(roleFromGroups(undefined)).toBeNull();
  });
});

describe("permission matrix", () => {
  const table: Array<[Permission, boolean, boolean, boolean]> = [
    // permission,        viewer, technician, admin
    ["view", true, true, true],
    ["ticket:create", true, true, true],
    ["ticket:update", false, true, true],
    ["asset:write", false, true, true],
    ["attachment:upload", false, true, true],
    ["asset:delete", false, false, true],
    ["license:manage", false, false, true],
    ["audit:view", false, false, true],
  ];
  it.each(table)("%s", (perm, viewer, tech, admin) => {
    expect(can("viewer", perm)).toBe(viewer);
    expect(can("technician", perm)).toBe(tech);
    expect(can("admin", perm)).toBe(admin);
    expect(can(null, perm)).toBe(false);
  });
});

describe("requirePermission", () => {
  const user = (role: SessionUser["role"]): SessionUser => ({ sub: "u", email: null, name: null, groups: [], role });
  it("401 when signed out, 403 when no role or insufficient role", () => {
    expect(() => requirePermission(null, "view")).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => requirePermission(user(null), "view")).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requirePermission(user("viewer"), "asset:write")).toThrowError(HttpError);
  });
  it("returns the user when allowed", () => {
    expect(requirePermission(user("admin"), "audit:view").sub).toBe("u");
  });
});
