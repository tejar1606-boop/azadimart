import { describe, expect, it } from "vitest";
import { aplusBlocksSchema, aplusComparedProductIds, aplusMediaUrls } from "./aplus";

const S = "11111111-1111-4111-8111-111111111111";
const img = `/media/product-media/${S}/22222222-2222-4222-8222-222222222222.webp`;

describe("A+ content blocks", () => {
  it("accepts every block type and an image-text block without an image", () => {
    const blocks = aplusBlocksSchema.parse([
      { type: "banner", desktopImageUrl: img, alt: "Hero" },
      { type: "image_text", heading: "Text only is fine", body: "No image needed" },
      { type: "image_text", imageUrl: img, imagePosition: "right", heading: "With image" },
      { type: "features", items: [{ title: "Light" }, { title: "Strong", imageUrl: img }] },
      { type: "comparison", productIds: [S], rows: [{ label: "Weight", values: ["2 kg", "3 kg"] }] },
      { type: "text", body: "Story" },
    ]);
    expect(blocks).toHaveLength(6);
    expect(aplusMediaUrls(blocks)).toEqual([img, img, img]);
    expect(aplusComparedProductIds(blocks)).toEqual([S]);
  });

  it("requires a banner image or video", () => {
    expect(() => aplusBlocksSchema.parse([{ type: "banner", alt: "x" }])).toThrow(/desktop image or video/);
  });

  it("rejects external or script URLs and unknown types", () => {
    expect(() => aplusBlocksSchema.parse([{ type: "image_text", heading: "x", imageUrl: "javascript:alert(1)" }])).toThrow();
    expect(() => aplusBlocksSchema.parse([{ type: "image_text", heading: "x", imageUrl: "https://evil.example/a.jpg" }])).toThrow();
    expect(() => aplusBlocksSchema.parse([{ type: "html", body: "<script>" }])).toThrow(/Unknown block type/);
  });

  it("limits the number of blocks", () => {
    expect(() => aplusBlocksSchema.parse(Array.from({ length: 8 }, () => ({ type: "text", body: "x" })))).toThrow(/Up to 7/);
  });
});
