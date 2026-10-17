import { z } from "zod";
import { COUPON_DISCOUNT_CHOICES, type productDraftSchema } from "./validation/index";
import { PRODUCT_MEDIA_LIMITS } from "./routes";

/** Rows per bulk file, and per request to the server (the page sends a file in batches). */
export const BULK_PRODUCT_LIMITS = { maxRows: 500, batchSize: 10, maxStockRows: 2000 } as const;

/** Parses CSV text (Excel "CSV UTF-8" or Google Sheets): quotes, commas/newlines inside quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  // Excel in some regions saves with semicolons; pick the separator the header row uses.
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** CSV that opens cleanly in Excel (BOM for ₹ and Indian scripts). Cells that look like formulas are escaped. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Columns of the bulk upload template, in order. `key` is how the page reads them. */
export const BULK_PRODUCT_COLUMNS = [
  { key: "sku", header: "SKU *", help: "Your unique code for this product, e.g. TSHIRT-RED-M (3–64 characters, must not be used on LOIMART before)" },
  { key: "title", header: "Product title *", help: "3–200 characters" },
  { key: "category", header: "Category *", help: "Exactly as in the category list on the bulk upload page" },
  { key: "description", header: "Description", help: "Product description. Needed unless you fill Specifications" },
  { key: "specifications", header: "Specifications", help: "Label: value pairs separated by |  e.g. Material: Cotton | Fit: Regular" },
  { key: "price", header: "Selling price (Rs) *", help: "Price the customer pays, e.g. 499" },
  { key: "mrp", header: "MRP (Rs)", help: "Optional; shown struck through when higher than the selling price" },
  { key: "weight", header: "Package weight (grams) *", help: "Weight with packing, e.g. 350" },
  { key: "stock", header: "Stock *", help: "Units you have now, e.g. 25" },
  { key: "variant", header: "Variant name", help: "Optional, e.g. Red / M. Leave empty for Default" },
  { key: "coupon", header: "LOIMART coupon limit (%)", help: `Optional. One of ${COUPON_DISCOUNT_CHOICES.join(", ")}. 0 or empty = not in LOIMART coupons` },
  { key: "photos", header: "Photo file names *", help: `File names of the square photos you upload on the page, separated by |  (first = cover, up to ${PRODUCT_MEDIA_LIMITS.maxImages})` },
] as const;
export type BulkProductKey = (typeof BULK_PRODUCT_COLUMNS)[number]["key"];

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|[*₹]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const HEADER_ALIASES: Record<string, BulkProductKey> = {
  sku: "sku", "product title": "title", title: "title", name: "title", "product name": "title", category: "category",
  description: "description", specifications: "specifications", specs: "specifications",
  "selling price": "price", price: "price", mrp: "mrp", "compare at price": "mrp",
  "package weight": "weight", weight: "weight", stock: "stock", quantity: "stock", qty: "stock", inventory: "stock",
  "variant name": "variant", variant: "variant", "loimart coupon limit": "coupon", "coupon limit": "coupon",
  "photo file names": "photos", photos: "photos", images: "photos", "image file names": "photos",
};

/** Maps each header cell to a template column (tolerant of case, *, ₹ and small wording changes). */
export function mapBulkHeaders(header: string[]): { columns: Array<BulkProductKey | null>; missing: string[] } {
  const columns = header.map((h) => HEADER_ALIASES[norm(h)] ?? null);
  const required: BulkProductKey[] = ["sku", "title", "category", "price", "weight", "stock", "photos"];
  const missing = required.filter((k) => !columns.includes(k)).map((k) => BULK_PRODUCT_COLUMNS.find((c) => c.key === k)!.header.replace(" *", ""));
  return { columns, missing };
}

export const splitList = (v: string) => v.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
/** Photo names are matched without folders and ignoring case. */
export const photoKey = (name: string) => (name.split(/[\\/]/).pop() ?? "").trim().toLowerCase();

const money = (v: string) => {
  const s = v.replace(/[₹,\s]|rs\.?/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
};
const whole = (v: string) => (/^\d+$/.test(v.replace(/[,\s]/g, "")) ? Number(v.replace(/[,\s]/g, "")) : null);

export type BulkCategory = { id: string; name: string; slug: string };
export type BulkProductDraft = {
  sku: string; title: string; categoryId: string; description: string; specifications: Array<{ label: string; value: string }>;
  pricePaise: number; compareAtPaise: number | undefined; weightGrams: number; onHand: number; variantTitle: string; couponMaxDiscountPct: number; photos: string[];
};

/**
 * Reads one sheet row into a product, or the problems with it (plain words a
 * seller can fix in Excel). Photo files are checked separately once uploaded.
 */
export function readBulkRow(cells: Record<BulkProductKey, string>, categories: BulkCategory[]): { draft?: BulkProductDraft; errors: string[] } {
  const errors: string[] = [];
  const get = (k: BulkProductKey) => (cells[k] ?? "").trim();
  const sku = get("sku");
  if (sku.length < 3 || sku.length > 64) errors.push("SKU must be 3–64 characters");
  const title = get("title").replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 200) errors.push("Product title must be 3–200 characters");
  const catText = get("category").toLowerCase();
  const matches = categories.filter((c) => c.name.toLowerCase() === catText || c.slug.toLowerCase() === catText);
  if (!catText) errors.push("Category is empty");
  else if (!matches.length) errors.push(`Category "${get("category")}" isn't in the list`);
  else if (matches.length > 1) errors.push(`More than one category is called "${get("category")}"; use its code (${matches.map((m) => m.slug).join(" or ")})`);

  const description = get("description");
  if (description.length > 20000) errors.push("Description is longer than 20,000 characters");
  const specifications: Array<{ label: string; value: string }> = [];
  for (const part of splitList(get("specifications"))) {
    const at = part.indexOf(":");
    const label = at > 0 ? part.slice(0, at).trim() : "";
    const value = at > 0 ? part.slice(at + 1).trim() : "";
    if (!label || !value) { errors.push(`Specification "${part}" needs the form Label: value`); continue; }
    if (label.length > 60 || value.length > 500) { errors.push(`Specification "${label}" is too long`); continue; }
    specifications.push({ label, value });
  }
  if (specifications.length > 40) errors.push("Up to 40 specifications");
  if (!description && !specifications.length) errors.push("Add a description or specifications");

  const pricePaise = money(get("price"));
  if (pricePaise === null || pricePaise <= 0) errors.push("Selling price must be a number like 499 or 499.50");
  let compareAtPaise: number | undefined;
  if (get("mrp")) {
    const m = money(get("mrp"));
    if (m === null) errors.push("MRP must be a number");
    else if (pricePaise !== null && m < pricePaise) errors.push("MRP can't be lower than the selling price");
    else compareAtPaise = m;
  }
  const weightGrams = whole(get("weight"));
  if (!weightGrams || weightGrams > 1_000_000) errors.push("Package weight must be whole grams, e.g. 350");
  const onHand = whole(get("stock"));
  if (onHand === null || onHand > 1_000_000) errors.push("Stock must be a whole number (0 or more)");
  const variantTitle = get("variant") || "Default";
  if (variantTitle.length > 120) errors.push("Variant name is too long");
  const coupon = get("coupon").replace("%", "").trim();
  const couponMaxDiscountPct = coupon ? Number(coupon) : 0;
  if (!(COUPON_DISCOUNT_CHOICES as readonly number[]).includes(couponMaxDiscountPct)) errors.push(`Coupon limit must be one of ${COUPON_DISCOUNT_CHOICES.join(", ")}`);
  const photos = [...new Set(splitList(get("photos")).map(photoKey))];
  if (!photos.length) errors.push("Add at least one photo file name");
  if (photos.length > PRODUCT_MEDIA_LIMITS.maxImages) errors.push(`Up to ${PRODUCT_MEDIA_LIMITS.maxImages} photos per product`);

  if (errors.length) return { errors };
  return { errors, draft: { sku, title, categoryId: matches[0]!.id, description, specifications, pricePaise: pricePaise!, compareAtPaise, weightGrams: weightGrams!, onHand: onHand!, variantTitle, couponMaxDiscountPct, photos } };
}

/** A product draft after productDraftSchema.parse (defaults applied). */
export type ProductDraftInput = z.infer<typeof productDraftSchema>;

/** One batch sent to POST /api/v1/products/bulk. Each product is checked again with productDraftSchema. */
export const productBulkCreateSchema = z.object({
  submitForQc: z.boolean().default(false),
  rows: z.array(z.object({ row: z.number().int().positive(), product: z.unknown() })).min(1).max(BULK_PRODUCT_LIMITS.batchSize),
});

/** POST /api/v1/products/stock: set stock by SKU (applies straight away). */
export const productBulkStockSchema = z.object({
  items: z.array(z.object({ sku: z.string().trim().min(1).max(64), onHand: z.number().int().min(0).max(1_000_000) })).min(1).max(BULK_PRODUCT_LIMITS.maxStockRows),
});
