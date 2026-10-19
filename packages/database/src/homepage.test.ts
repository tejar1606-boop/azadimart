import { describe, expect, it } from "vitest";
import { keepSavedBanners } from "./homepage";

const sec = (type: string, settings: Record<string, unknown> = {}) => ({ type, isVisible: true, settings });

describe("Admin layout saves keep Banner Studio content", () => {
  it("keeps the saved banner images when an old editor saves", () => {
    const saved = [sec("hero", { sectionKey: "h", slides: ["new"] }), sec("featured_products", { limit: 12 })];
    const incoming = [sec("hero", { sectionKey: "h", slides: ["old"] }), sec("featured_products", { limit: 6 })];
    const out = keepSavedBanners(incoming, saved);
    expect(out[0]!.settings.slides).toEqual(["new"]);
    expect(out[1]!.settings.limit).toBe(6);
  });

  it("follows a banner section when Admin moves it", () => {
    const saved = [sec("promo_banner", { sectionKey: "a", img: "A" }), sec("promo_banner", { sectionKey: "b", img: "B" })];
    const out = keepSavedBanners([saved[1]!, saved[0]!].map((s) => ({ ...s, settings: { ...s.settings, img: "stale" } })), saved);
    expect(out.map((s) => s.settings.img)).toEqual(["B", "A"]);
  });

  it("a newly added banner section never copies another one's banners", () => {
    const saved = [sec("promo_banner", { sectionKey: "a", img: "A" })];
    const out = keepSavedBanners([sec("promo_banner", {}), sec("promo_banner", { sectionKey: "a" })], saved);
    expect(out[0]!.settings.img).toBeUndefined();
    expect(out[1]!.settings.img).toBe("A");
  });

  it("matches sections saved before keys existed by their order", () => {
    const saved = [sec("hero", { slides: ["live"] })];
    expect(keepSavedBanners([sec("hero", { slides: ["stale"] })], saved)[0]!.settings.slides).toEqual(["live"]);
  });
});
