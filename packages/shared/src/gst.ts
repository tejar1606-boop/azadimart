import { z } from "zod";

/**
 * GST for products and invoices.
 *
 * Every product type has an HSN code, and the government fixes the GST rate for
 * each code. LOIMART keeps a default HSN code and rate for each category (set
 * in Admin and checked by a CA). Sellers can give a product its own HSN and
 * rate, which QC sees. Some codes depend on price: clothing, footwear and
 * textile made-ups are 5% up to ₹2,500 a piece and 18% above.
 *
 * Prices on LOIMART INCLUDE GST, so the invoice works the tax out backwards
 * from what the customer pays.
 */

/** GST rates in basis points (500 = 5%). Since 22 Sep 2025: 5%, 18% and 40%, plus 0%, 0.25% and 3% for a few goods. */
export const GST_RATES_BPS = [0, 25, 300, 500, 1800, 4000] as const;
/** Used when a product has no rate yet, so tax is never under-shown. */
export const FALLBACK_GST_RATE_BPS = 1800;

export const hsnCodeSchema = z.string().trim().regex(/^\d{4}(\d{2}){0,2}$/, "HSN code is 4, 6 or 8 digits");
const rateBps = z.number().int().refine((v) => (GST_RATES_BPS as readonly number[]).includes(v), "Choose a GST rate: 0%, 0.25%, 3%, 5%, 18% or 40%");

/** A category's (or product's) GST: rate, and optionally a higher rate above a price per piece. */
export type GstRule = {
  hsnCode: string | null;
  gstRateBps: number | null;
  /** Price per piece (before GST) up to which `gstRateBps` applies; above it `rateAboveLimitBps`. */
  priceLimitPaise?: number | null;
  rateAboveLimitBps?: number | null;
};

export const categoryGstSchema = z.object({
  hsnCode: hsnCodeSchema.nullable(),
  gstRateBps: rateBps.nullable(),
  priceLimitPaise: z.number().int().positive().max(100_000_000).nullable().default(null),
  rateAboveLimitBps: rateBps.nullable().default(null),
}).superRefine((v, ctx) => {
  if ((v.hsnCode === null) !== (v.gstRateBps === null)) ctx.addIssue({ code: "custom", path: ["gstRateBps"], message: "Enter both the HSN code and the GST rate, or neither" });
  if ((v.priceLimitPaise === null) !== (v.rateAboveLimitBps === null)) ctx.addIssue({ code: "custom", path: ["rateAboveLimitBps"], message: "A price rule needs both the price and the higher rate" });
});
export const categoryGstUpdateSchema = z.object({ items: z.array(categoryGstSchema.and(z.object({ categoryId: z.string().uuid() }))).max(500) });

/** A seller's own HSN for one product (null = use the category's). */
export const productGstSchema = z.object({ hsnCode: hsnCodeSchema, gstRateBps: rateBps }).nullable();

export const formatGstRate = (bps: number) => `${bps / 100}%`;

/**
 * The rate that applies to one piece sold at `unitPricePaise` (GST included).
 * With a price rule, the piece's value before GST at the lower rate decides.
 */
export function gstRateFor(rule: GstRule, unitPricePaise: number): number {
  const base = rule.gstRateBps ?? FALLBACK_GST_RATE_BPS;
  if (rule.priceLimitPaise == null || rule.rateAboveLimitBps == null) return base;
  const valueBeforeTax = unitPricePaise * 10_000 / (10_000 + base);
  return valueBeforeTax <= rule.priceLimitPaise ? base : rule.rateAboveLimitBps;
}

/** The product's own HSN if it has one, else its category's, else the parent category's. */
export function effectiveGstRule(product: { hsnCode: string | null; gstRateBps: number | null }, categories: GstRule[]): GstRule & { source: "PRODUCT" | "CATEGORY" | "NONE" } {
  if (product.hsnCode && product.gstRateBps != null) return { hsnCode: product.hsnCode, gstRateBps: product.gstRateBps, source: "PRODUCT" };
  const rule = categories.find((c) => c.hsnCode && c.gstRateBps != null);
  return rule ? { ...rule, source: "CATEGORY" } : { hsnCode: null, gstRateBps: null, source: "NONE" };
}

/** Splits an amount that includes GST into the value before tax and the tax (paise, rounded). */
export function splitGstInclusive(amountPaise: number, rateBps: number) {
  const taxablePaise = Math.round(amountPaise * 10_000 / (10_000 + rateBps));
  return { taxablePaise, taxPaise: amountPaise - taxablePaise };
}

/** GST state codes (first two digits of a GSTIN) by state name. */
export const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05", Haryana: "06", Delhi: "07",
  Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11", "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14",
  Mizoram: "15", Tripura: "16", Meghalaya: "17", Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22",
  "Madhya Pradesh": "23", Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30",
  Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35", Telangana: "36",
  "Andhra Pradesh": "37", Ladakh: "38",
};
const normState = (s: string) => s.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
export function gstStateCode(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  const key = normState(stateName);
  return Object.entries(GST_STATE_CODES).find(([name]) => normState(name) === key)?.[1] ?? (key === "orissa" ? "21" : null);
}
/** Same state (CGST + SGST) or another state (IGST). Unknown states count as another state. */
export function isInterStateSupply(sellerState: string | null | undefined, buyerState: string | null | undefined) {
  const a = gstStateCode(sellerState), b = gstStateCode(buyerState);
  return !a || !b || a !== b;
}

export type InvoiceLineInput = { title: string; sku: string; hsnCode: string | null; gstRateBps: number; quantity: number; unitPricePaise: number; discountPaise: number };
export type InvoiceLine = InvoiceLineInput & { grossPaise: number; netPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };

/**
 * Tax lines for an invoice. `discountPaise` is the seller's own discount on the
 * line (it lowers the taxable value); a discount LOIMART pays doesn't, because
 * the seller still receives the full price. With `charged` false (a seller
 * without GST registration) no tax is shown.
 */
export function invoiceLines(lines: InvoiceLineInput[], opts: { interState: boolean; charged: boolean }) {
  const out: InvoiceLine[] = lines.map((line) => {
    const grossPaise = line.unitPricePaise * line.quantity;
    const netPaise = Math.max(0, grossPaise - line.discountPaise);
    if (!opts.charged) return { ...line, gstRateBps: 0, grossPaise, netPaise, taxablePaise: netPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    const { taxablePaise, taxPaise } = splitGstInclusive(netPaise, line.gstRateBps);
    const cgstPaise = opts.interState ? 0 : Math.floor(taxPaise / 2);
    return { ...line, grossPaise, netPaise, taxablePaise, cgstPaise, sgstPaise: opts.interState ? 0 : taxPaise - cgstPaise, igstPaise: opts.interState ? taxPaise : 0 };
  });
  const sum = (k: "grossPaise" | "netPaise" | "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "discountPaise") => out.reduce((n, l) => n + l[k], 0);
  return { lines: out, totals: { grossPaise: sum("grossPaise"), discountPaise: sum("discountPaise"), taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("netPaise") } };
}

/** Indian financial year label for a date, e.g. 2026-10-21 → "2026-27" (April to March, India time). */
export function financialYearOf(date: Date) {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
export type InvoiceKind = "TAX_INVOICE" | "BILL_OF_SUPPLY" | "CREDIT_NOTE";
const PREFIX: Record<InvoiceKind, string> = { TAX_INVOICE: "LOI", BILL_OF_SUPPLY: "LBS", CREDIT_NOTE: "LCN" };
/** Invoice number in the seller's own series, at most 16 characters as GST requires: "LOI/2627/000045". */
export function invoiceNumber(kind: InvoiceKind, financialYear: string, sequence: number) {
  return `${PREFIX[kind]}/${financialYear.replace("-", "").slice(2)}/${String(sequence).padStart(6, "0")}`;
}

/** Amount in words for invoices: 1234.50 → "One thousand two hundred thirty-four rupees and fifty paise only". */
export function rupeesInWords(paise: number) {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (n: number) => (n < 20 ? ones[n]! : tens[Math.floor(n / 10)]! + (n % 10 ? "-" + ones[n % 10] : ""));
  const three = (n: number) => [n >= 100 ? ones[Math.floor(n / 100)] + " hundred" : "", n % 100 ? two(n % 100) : ""].filter(Boolean).join(" ");
  const words = (n: number): string => {
    if (n === 0) return "zero";
    const parts: string[] = [];
    for (const [size, name] of [[10_000_000, "crore"], [100_000, "lakh"], [1000, "thousand"]] as const) {
      if (n >= size) { parts.push(words(Math.floor(n / size)) + " " + name); n %= size; }
    }
    if (n) parts.push(three(n));
    return parts.join(" ");
  };
  const rupees = Math.floor(paise / 100), p = paise % 100;
  const text = words(rupees) + (rupees === 1 ? " rupee" : " rupees") + (p ? " and " + two(p) + " paise" : "") + " only";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Starter suggestions per category (slug), to be confirmed by LOIMART's CA
 * before use. Admin → GST & HSN can fill empty categories with these.
 */
export const SUGGESTED_CATEGORY_GST: Record<string, Omit<GstRule, "hsnCode"> & { hsnCode: string; note: string }> = {
  men: { hsnCode: "6203", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800, note: "Clothing: 5% up to ₹2,500 a piece, 18% above" },
  women: { hsnCode: "6204", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800, note: "Clothing: 5% up to ₹2,500 a piece, 18% above" },
  kids: { hsnCode: "6209", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800, note: "Clothing: 5% up to ₹2,500 a piece, 18% above" },
  sportswear: { hsnCode: "6112", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800, note: "Clothing: 5% up to ₹2,500 a piece, 18% above" },
  footwear: { hsnCode: "6404", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800, note: "Footwear: 5% up to ₹2,500 a pair, 18% above" },
  "bedding-linen": { hsnCode: "6302", gstRateBps: 500, priceLimitPaise: 250_000, rateAboveLimitBps: 1800, note: "Textile made-ups: 5% up to ₹2,500 a piece, 18% above" },
  "watches-accessories": { hsnCode: "9102", gstRateBps: 1800, note: "Wrist watches" },
  cookware: { hsnCode: "7323", gstRateBps: 500, note: "Steel kitchen and table ware" },
  "bottles-storage": { hsnCode: "3924", gstRateBps: 1800, note: "Plastic household articles (steel bottles: 7323 at 5%)" },
  "home-decor": { hsnCode: "4420", gstRateBps: 1800, note: "Decorative articles; handicrafts may be 5%" },
  "hair-care": { hsnCode: "3305", gstRateBps: 500, note: "Shampoo, hair oil" },
  "skin-care": { hsnCode: "3304", gstRateBps: 1800, note: "Skin care preparations" },
  makeup: { hsnCode: "3304", gstRateBps: 1800, note: "Make-up preparations" },
  fragrances: { hsnCode: "3303", gstRateBps: 1800, note: "Perfumes" },
  audio: { hsnCode: "8518", gstRateBps: 1800, note: "Headphones, speakers" },
  "power-banks-chargers": { hsnCode: "8507", gstRateBps: 1800, note: "Power banks (chargers: 8504)" },
  "mobile-accessories": { hsnCode: "3926", gstRateBps: 1800, note: "Cases and covers" },
  cricket: { hsnCode: "9506", gstRateBps: 500, note: "Sports goods" },
  "fitness-equipment": { hsnCode: "9506", gstRateBps: 500, note: "Sports and fitness goods" },
  "trolley-bags": { hsnCode: "4202", gstRateBps: 1800, note: "Trunks, suitcases" },
  backpacks: { hsnCode: "4202", gstRateBps: 1800, note: "Bags" },
  "travel-accessories": { hsnCode: "4202", gstRateBps: 1800, note: "Travel goods" },
};

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const optional = (schema: z.ZodString) => z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());
/** LOIMART's own registered details, printed on every invoice as the e-commerce operator. */
export const companyDetailsSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().min(2).max(80),
  gstin: optional(z.string().trim().toUpperCase().regex(GSTIN_PATTERN, "Enter a valid 15-character GSTIN")),
  pan: optional(z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN")),
  cin: optional(z.string().trim().toUpperCase().regex(/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, "Enter a valid CIN")),
  address: z.string().trim().min(10, "Enter the full registered address").max(400),
  state: z.string().trim().min(2).max(80),
  email: optional(z.string().trim().email()),
}).superRefine((v, ctx) => {
  if (v.gstin && v.pan && v.gstin.slice(2, 12) !== v.pan) ctx.addIssue({ code: "custom", path: ["pan"], message: "PAN doesn't match the GSTIN (characters 3–12)" });
});
