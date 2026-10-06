import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTES,
  PRODUCT_MEDIA_LIMITS,
  SELLER_ROUTES,
  STOREFRONT_ROUTES,
} from "./routes";

describe("route catalog", () => {
  it("includes health checks on every app", () => {
    expect(STOREFRONT_ROUTES).toContain("/api/health");
    expect(SELLER_ROUTES).toContain("/api/health");
    expect(ADMIN_ROUTES).toContain("/api/health");
  });

  it("covers the admin enterprise surfaces", () => {
    const required = [
      "/dashboard",
      "/orders",
      "/products",
      "/sellers",
      "/customers",
      "/qc",
      "/logistics",
      "/payments",
      "/finance",
      "/returns",
      "/support",
      "/marketing",
      "/security",
      "/online-store",
    ];
    for (const path of required) {
      expect(ADMIN_ROUTES).toContain(path);
    }
  });

  it("caps product media at 8 images and 1 video", () => {
    expect(PRODUCT_MEDIA_LIMITS.maxImages).toBe(8);
    expect(PRODUCT_MEDIA_LIMITS.maxVideos).toBe(1);
  });
});
