import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_PERMISSIONS, DEFAULT_STAFF_ROLES, STAFF_PERMISSION_KEYS, adminPagePermission, firstAdminPage, staffRoleSchema } from "./staff";

describe("team roles", () => {
  it("maps admin pages to areas by the longest prefix", () => {
    expect(adminPagePermission("/orders")).toBe("orders");
    expect(adminPagePermission("/online-store/page-banners")).toBe("storefront");
    expect(adminPagePermission("/marketing/ads")).toBe("marketing");
    expect(adminPagePermission("/support/123")).toBe("support");
    expect(adminPagePermission("/team")).toBe("team");
    expect(adminPagePermission("/ordersx")).toBeNull();
    expect(adminPagePermission("/login")).toBeNull();
  });

  it("sends people to the first page their role allows", () => {
    expect(firstAdminPage(["support"])).toBe("/support");
    expect(firstAdminPage(["catalog", "dashboard"])).toBe("/dashboard");
    expect(firstAdminPage([])).toBe("/login");
  });

  it("ready-made roles are valid and Admin has everything", () => {
    for (const role of DEFAULT_STAFF_ROLES) expect(staffRoleSchema.safeParse(role).success).toBe(true);
    expect(DEFAULT_STAFF_ROLES.find((r) => r.name === "Admin")?.permissions).toEqual(STAFF_PERMISSION_KEYS);
    expect(new Set(DEFAULT_STAFF_ROLES.map((r) => r.name)).size).toBe(DEFAULT_STAFF_ROLES.length);
  });

  it("every area has at least one page", () => {
    for (const key of STAFF_PERMISSION_KEYS) expect(ADMIN_PAGE_PERMISSIONS.some(([, p]) => p === key)).toBe(true);
  });
});
