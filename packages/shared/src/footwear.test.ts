import { describe, expect, it } from "vitest";
import { KIDS_SHOE_ORDER, SHOE_SIZE_CHART, isShoeSize } from "./footwear";
import { SIZE_PRESETS, compareSizes } from "./variants";

describe("footwear sizes", () => {
  it("has size sets for men, women, unisex, half sizes, EU and kids", () => {
    for (const label of ["Footwear UK (men)", "Footwear UK (women)", "Footwear UK (unisex)", "Footwear UK half sizes", "Footwear EU", "Footwear (kids)"]) expect(SIZE_PRESETS.some((p) => p.label === label)).toBe(true);
  });
  it("sorts kids sizes the way feet grow, and half sizes in between", () => {
    expect(["UK 1", "Kids 13", "Kids 10"].sort(compareSizes)).toEqual(["Kids 10", "Kids 13", "UK 1"]);
    expect(["UK 8", "UK 7.5", "UK 7"].sort(compareSizes)).toEqual(["UK 7", "UK 7.5", "UK 8"]);
    expect(["EU 44", "EU 40"].sort(compareSizes)).toEqual(["EU 40", "EU 44"]);
    expect(KIDS_SHOE_ORDER[0]).toBe("Kids 6");
  });
  it("knows a shoe size from a clothing size", () => {
    expect(["UK 8", "UK 7.5", "EU 42", "US 9", "Kids 10"].every(isShoeSize)).toBe(true);
    expect(["M", "XL", "32", "Free Size", "Cabin"].some(isShoeSize)).toBe(false);
  });
  it("size chart goes up in foot length", () => {
    const cm = SHOE_SIZE_CHART.map((r) => Number(r.footCm));
    expect(cm.every((v, i) => i === 0 || v > cm[i - 1]!)).toBe(true);
  });
});
