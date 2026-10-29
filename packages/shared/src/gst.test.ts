import { describe, expect, it } from "vitest";
import { categoryGstSchema, effectiveGstRule, financialYearOf, gstRateFor, gstStateCode, invoiceLines, invoiceNumber, isInterStateSupply, rupeesInWords, splitGstInclusive } from "./gst";

const clothing = { hsnCode: "6204", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800 };

describe("GST rate for a product", () => {
  it("uses the category rate", () => {
    expect(gstRateFor({ hsnCode: "3304", gstRateBps: 1800 }, 99_900)).toBe(1800);
  });
  it("clothing is 5% up to ₹2,500 a piece (before tax) and 18% above", () => {
    expect(gstRateFor(clothing, 262_500)).toBe(500); // ₹2,625 incl. 5% = ₹2,500 before tax
    expect(gstRateFor(clothing, 262_600)).toBe(1800);
    expect(gstRateFor(clothing, 99_900)).toBe(500);
  });
  it("falls back to 18% when nothing is set", () => {
    expect(gstRateFor({ hsnCode: null, gstRateBps: null }, 10_000)).toBe(1800);
  });
  it("the product's own HSN wins, then the nearest category", () => {
    expect(effectiveGstRule({ hsnCode: "6206", gstRateBps: 500 }, [clothing]).source).toBe("PRODUCT");
    expect(effectiveGstRule({ hsnCode: null, gstRateBps: null }, [{ hsnCode: null, gstRateBps: null }, clothing])).toMatchObject({ hsnCode: "6204", source: "CATEGORY" });
    expect(effectiveGstRule({ hsnCode: null, gstRateBps: null }, []).source).toBe("NONE");
  });
  it("admin rules must be complete", () => {
    expect(categoryGstSchema.safeParse({ hsnCode: "6204", gstRateBps: 500 }).success).toBe(true);
    expect(categoryGstSchema.safeParse({ hsnCode: "6204", gstRateBps: null }).success).toBe(false);
    expect(categoryGstSchema.safeParse({ hsnCode: "62", gstRateBps: 500 }).success).toBe(false);
    expect(categoryGstSchema.safeParse({ hsnCode: "6204", gstRateBps: 1200 }).success).toBe(false); // 12% no longer exists
    expect(categoryGstSchema.safeParse({ hsnCode: "6204", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: null }).success).toBe(false);
  });
});

describe("tax on an invoice", () => {
  it("splits a GST-inclusive price", () => {
    expect(splitGstInclusive(105_000, 500)).toEqual({ taxablePaise: 100_000, taxPaise: 5_000 });
    expect(splitGstInclusive(118_000, 1800)).toEqual({ taxablePaise: 100_000, taxPaise: 18_000 });
  });
  it("same state is CGST + SGST, another state IGST", () => {
    expect(isInterStateSupply("Karnataka", "karnataka")).toBe(false);
    expect(isInterStateSupply("Karnataka", "Kerala")).toBe(true);
    expect(gstStateCode("Jammu & Kashmir")).toBe("01");
    const line = { title: "Kurta", sku: "K1", hsnCode: "6204", gstRateBps: 500, quantity: 2, unitPricePaise: 52_500, discountPaise: 5_000 };
    const local = invoiceLines([line], { interState: false, charged: true });
    expect(local.totals).toMatchObject({ grossPaise: 105_000, totalPaise: 100_000, taxablePaise: 95_238, cgstPaise: 2_381, sgstPaise: 2_381, igstPaise: 0 });
    const away = invoiceLines([line], { interState: true, charged: true });
    expect(away.totals).toMatchObject({ taxablePaise: 95_238, igstPaise: 4_762, cgstPaise: 0 });
    expect(away.totals.taxablePaise + away.totals.igstPaise).toBe(away.totals.totalPaise);
  });
  it("a seller without GST registration charges no tax", () => {
    const r = invoiceLines([{ title: "Diya", sku: "D", hsnCode: "6913", gstRateBps: 1800, quantity: 1, unitPricePaise: 20_000, discountPaise: 0 }], { interState: false, charged: false });
    expect(r.totals).toMatchObject({ taxablePaise: 20_000, cgstPaise: 0, igstPaise: 0, totalPaise: 20_000 });
  });
});

describe("invoice numbers", () => {
  it("financial year runs April to March, India time", () => {
    expect(financialYearOf(new Date("2026-10-21T10:00:00Z"))).toBe("2026-27");
    expect(financialYearOf(new Date("2027-03-31T18:30:00Z"))).toBe("2027-28"); // 1 April, 00:00 IST
    expect(financialYearOf(new Date("2027-03-31T18:29:00Z"))).toBe("2026-27"); // 31 March, 23:59 IST
  });
  it("is at most 16 characters", () => {
    expect(invoiceNumber("TAX_INVOICE", "2026-27", 45)).toBe("LOI/2627/000045");
    expect(invoiceNumber("CREDIT_NOTE", "2026-27", 999_999).length).toBeLessThanOrEqual(16);
  });
  it("writes the amount in words", () => {
    expect(rupeesInWords(123_450)).toBe("One thousand two hundred thirty-four rupees and fifty paise only");
    expect(rupeesInWords(25_000_000)).toBe("Two lakh fifty thousand rupees only");
  });
});
