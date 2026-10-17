import { describe, expect, it } from "vitest";
import { mapBulkHeaders, parseCsv, readBulkRow, toCsv, BULK_PRODUCT_COLUMNS, type BulkProductKey } from "./bulk-products";

const cats = [{ id: "11111111-1111-4111-8111-111111111111", name: "Fashion", slug: "fashion" }];
const base: Record<BulkProductKey, string> = { sku: "TSHIRT-RED-M", title: "Red cotton T-shirt", category: "fashion", description: "Soft cotton", specifications: "", price: "₹1,299.50", mrp: "1999", weight: "350", stock: "25", variant: "", coupon: "10%", photos: "Shirt-1.JPG | photos/shirt-2.jpg" };

describe("bulk products", () => {
  it("parses Excel CSV with BOM, quotes, commas and newlines", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""","line1\nline2"\r\n\r\n')).toEqual([["a", "b"], ['x, "y"', "line1\nline2"]]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("round-trips the template and escapes formulas", () => {
    const csv = toCsv([BULK_PRODUCT_COLUMNS.map((c) => c.header), ["=HYPERLINK(1)", -5]]);
    const rows = parseCsv(csv);
    expect(mapBulkHeaders(rows[0]!).missing).toEqual([]);
    expect(rows[1]).toEqual(["'=HYPERLINK(1)", "-5"]);
  });
  it("reports missing columns", () => {
    expect(mapBulkHeaders(["SKU", "Title"]).missing).toContain("Category");
  });
  it("reads a good row", () => {
    const { draft, errors } = readBulkRow(base, cats);
    expect(errors).toEqual([]);
    expect(draft).toMatchObject({ categoryId: cats[0]!.id, pricePaise: 129950, compareAtPaise: 199900, weightGrams: 350, onHand: 25, couponMaxDiscountPct: 10, variantTitle: "Default", photos: ["shirt-1.jpg", "shirt-2.jpg"] });
  });
  it("explains problems in plain words", () => {
    const { draft, errors } = readBulkRow({ ...base, category: "Toys", price: "abc", mrp: "100", coupon: "12", description: "", specifications: "Material Cotton", photos: "" }, cats);
    expect(draft).toBeUndefined();
    expect(errors.join(" | ")).toMatch(/Category "Toys"/);
    expect(errors.join(" | ")).toMatch(/Selling price/);
    expect(errors.join(" | ")).toMatch(/Coupon limit/);
    expect(errors.join(" | ")).toMatch(/Label: value/);
    expect(errors.join(" | ")).toMatch(/photo/);
  });
});
