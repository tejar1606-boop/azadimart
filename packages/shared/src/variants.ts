import { z } from "zod";

/** Up to this many colour × size combinations per product. */
export const MAX_VARIANTS = 100;

/** Ready-made colours for the seller's picker (name + swatch). Sellers can add their own. */
export const COLOR_PRESETS: Array<{ name: string; hex: string }> = [
  { name: "Black", hex: "#111111" }, { name: "White", hex: "#FFFFFF" }, { name: "Grey", hex: "#9CA3AF" }, { name: "Navy Blue", hex: "#1E2A5A" },
  { name: "Blue", hex: "#2563EB" }, { name: "Sky Blue", hex: "#7DD3FC" }, { name: "Green", hex: "#16A34A" }, { name: "Olive", hex: "#6B7A2E" },
  { name: "Red", hex: "#DC2626" }, { name: "Maroon", hex: "#7F1D1D" }, { name: "Pink", hex: "#EC4899" }, { name: "Peach", hex: "#FDBA9A" },
  { name: "Orange", hex: "#F97316" }, { name: "Mustard", hex: "#D4A017" }, { name: "Yellow", hex: "#FACC15" }, { name: "Beige", hex: "#E8D9B5" },
  { name: "Brown", hex: "#7C4A2D" }, { name: "Purple", hex: "#7C3AED" }, { name: "Lavender", hex: "#C4B5FD" }, { name: "Gold", hex: "#C9A227" },
  { name: "Silver", hex: "#C0C0C0" }, { name: "Multicolour", hex: "multi" },
];

/** Size sets sellers can add in one tap (clothing, kids, waist, footwear, free size). */
export const SIZE_PRESETS: Array<{ label: string; sizes: string[] }> = [
  { label: "Clothing", sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] },
  { label: "Free size", sizes: ["Free Size"] },
  { label: "Waist (inches)", sizes: ["28", "30", "32", "34", "36", "38", "40"] },
  { label: "Kids (age)", sizes: ["0-6M", "6-12M", "1-2Y", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "6-7Y", "7-8Y", "8-9Y", "9-10Y"] },
  { label: "Footwear (UK)", sizes: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"] },
  { label: "Bra", sizes: ["32B", "34B", "36B", "32C", "34C", "36C"] },
];

const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];
/** Sorts sizes the way shoppers expect: XS→3XL, then numbers ascending, else as given. */
export function compareSizes(a: string, b: string): number {
  const la = LETTER_ORDER.indexOf(a.toUpperCase()), lb = LETTER_ORDER.indexOf(b.toUpperCase());
  if (la >= 0 && lb >= 0) return la - lb;
  const na = parseFloat(a.replace(/[^\d.]/g, "")), nb = parseFloat(b.replace(/[^\d.]/g, ""));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  if (la >= 0) return -1;
  if (lb >= 0) return 1;
  return 0;
}

/** "Red / M", "Red", "M" or "Default". */
export const variantTitleOf = (attrs: { color?: string; size?: string }) => [attrs.color, attrs.size].filter(Boolean).join(" / ") || "Default";

/** A swatch background for a colour hex ("multi" = rainbow). */
export const swatchBackground = (hex: string | undefined) =>
  hex === "multi" ? "conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)" : hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#E5E7EB";

const optionText = z.string().trim().min(1).max(40);
/** One colour/size combination as the seller sends it. */
export const productVariantInputSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(3).max(64),
  pricePaise: z.number().int().positive("Enter a selling price"),
  compareAtPaise: z.number().int().nonnegative().nullable().optional(),
  onHand: z.number().int().nonnegative().max(1_000_000).default(0),
  color: optionText.optional(),
  colorHex: z.string().regex(/^(#[0-9a-fA-F]{6}|multi)$/).optional(),
  size: z.string().trim().min(1).max(20).optional(),
});
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

/** The full list: unique SKUs and unique colour+size pairs. */
export const productVariantListSchema = z.array(productVariantInputSchema).min(1).max(MAX_VARIANTS)
  .refine((list) => new Set(list.map((v) => v.sku.toLowerCase())).size === list.length, "Each variant needs its own SKU")
  .refine((list) => new Set(list.map((v) => `${v.color ?? ""}|${v.size ?? ""}`.toLowerCase())).size === list.length, "The same colour and size is listed twice");

/** Variant attributes stored in product_variants.attributes. */
export const variantAttributes = (v: Pick<ProductVariantInput, "color" | "colorHex" | "size">): Record<string, string> => ({
  ...(v.color ? { color: v.color } : {}), ...(v.color && v.colorHex ? { colorHex: v.colorHex } : {}), ...(v.size ? { size: v.size } : {}),
});

/** Photo → colour it shows. */
export const imageColorsSchema = z.record(z.string().uuid(), optionText);
