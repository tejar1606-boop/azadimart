import { describe, expect, it } from "vitest";
import { comparePrices, discountPct } from "./price-changes";

const v = (id: string, price: number, mrp: number | null, sku = id.toUpperCase()) => ({ id, sku, title: id, pricePaise: price, compareAtPaise: mrp });

describe("price changes on an edit", () => {
  it("works out the discount", () => {
    expect(discountPct(80000, 100000)).toBe(20);
    expect(discountPct(80000, null)).toBe(0);
    expect(discountPct(80000, 70000)).toBe(0);
  });
  it("shows each size's discount before and after", () => {
    const r = comparePrices([v("s", 80000, 100000), v("m", 90000, 100000)], [v("s", 55000, 100000), v("m", 90000, 100000)]);
    expect(r.changed).toBe(true);
    expect(r.rows[0]).toMatchObject({ changed: true, before: { discountPct: 20 }, after: { discountPct: 45 }, mrpRaised: false });
    expect(r.rows[1]!.changed).toBe(false);
    expect([r.discountBefore, r.discountAfter]).toEqual([20, 45]);
  });
  it("flags a raised MRP that fakes a bigger discount", () => {
    const r = comparePrices([v("s", 99900, 129900)], [v("s", 99900, 299900)]);
    expect(r.mrpRaised).toBe(true);
    expect(r.rows[0]!.after.discountPct).toBe(67);
  });
  it("flags very big discounts and new sizes; matches by SKU when there is no id", () => {
    const r = comparePrices([v("s", 50000, 100000)], [{ sku: "S", title: "S", pricePaise: 20000, compareAtPaise: 100000 }, { sku: "XL", title: "XL", pricePaise: 60000, compareAtPaise: 100000 }]);
    expect(r.rows[0]).toMatchObject({ isNew: false, bigDiscount: true, after: { discountPct: 80 } });
    expect(r.rows[1]!.isNew).toBe(true);
  });
  it("nothing changed: no flags", () => {
    const r = comparePrices([v("s", 50000, 100000)], [v("s", 50000, 100000)]);
    expect(r.changed).toBe(false);
    expect(r.mrpRaised).toBe(false);
  });
});
