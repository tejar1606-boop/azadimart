import { describe, expect, it } from "vitest";
import { pageBannerLive, pageBannerSchema } from "./page-banners";

const ok = { pageKey: "shop", desktopImageUrl: "/media/site-media/abc.webp" };
describe("page banners", () => {
  it("accepts known pages and category pages", () => {
    expect(pageBannerSchema.safeParse(ok).success).toBe(true);
    expect(pageBannerSchema.safeParse({ ...ok, pageKey: "category:6f1c8f2e-3b8a-4c5d-9e7f-1a2b3c4d5e6f" }).success).toBe(true);
    expect(pageBannerSchema.safeParse({ ...ok, pageKey: "admin" }).success).toBe(false);
  });
  it("only allows uploaded or https images and safe links", () => {
    expect(pageBannerSchema.safeParse({ ...ok, desktopImageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(pageBannerSchema.safeParse({ ...ok, desktopImageUrl: "http://x.test/a.png" }).success).toBe(false);
    expect(pageBannerSchema.safeParse({ ...ok, href: "//evil.test" }).success).toBe(false);
    expect(pageBannerSchema.safeParse({ ...ok, href: "/c/fashion" }).success).toBe(true);
  });
  it("end must be after start", () => {
    expect(pageBannerSchema.safeParse({ ...ok, startsAt: "2026-10-12T00:00:00+05:30", endsAt: "2026-10-11T00:00:00+05:30" }).success).toBe(false);
  });
  it("shows only when on and within its dates", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(pageBannerLive({ isActive: true, startsAt: null, endsAt: null }, now)).toBe(true);
    expect(pageBannerLive({ isActive: false, startsAt: null, endsAt: null }, now)).toBe(false);
    expect(pageBannerLive({ isActive: true, startsAt: "2026-10-11T00:00:00Z", endsAt: null }, now)).toBe(false);
    expect(pageBannerLive({ isActive: true, startsAt: null, endsAt: "2026-10-10T11:00:00Z" }, now)).toBe(false);
  });
});
