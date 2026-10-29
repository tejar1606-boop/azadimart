/**
 * Footwear: size chart (India uses UK sizes), how to tell a shoe size, and
 * the details sellers are asked for. Sizes are approximate; brands vary.
 */
export type ShoeSizeRow = { uk: string; eu: string; usMen: string; usWomen: string; footCm: string };
export const SHOE_SIZE_CHART: ShoeSizeRow[] = [
  { uk: "3", eu: "36", usMen: "–", usWomen: "5", footCm: "22.5" },
  { uk: "4", eu: "37", usMen: "5", usWomen: "6", footCm: "23.3" },
  { uk: "5", eu: "38", usMen: "6", usWomen: "7", footCm: "24.1" },
  { uk: "6", eu: "39", usMen: "7", usWomen: "8", footCm: "24.8" },
  { uk: "7", eu: "40/41", usMen: "8", usWomen: "9", footCm: "25.6" },
  { uk: "8", eu: "42", usMen: "9", usWomen: "10", footCm: "26.4" },
  { uk: "9", eu: "43", usMen: "10", usWomen: "11", footCm: "27.1" },
  { uk: "10", eu: "44", usMen: "11", usWomen: "12", footCm: "27.9" },
  { uk: "11", eu: "45", usMen: "12", usWomen: "–", footCm: "28.7" },
  { uk: "12", eu: "46", usMen: "13", usWomen: "–", footCm: "29.5" },
];
export type KidsShoeRow = { uk: string; eu: string; age: string; footCm: string };
export const KIDS_SHOE_SIZE_CHART: KidsShoeRow[] = [
  { uk: "Kids 6", eu: "23", age: "2–3 yrs", footCm: "14.0" },
  { uk: "Kids 7", eu: "24", age: "3 yrs", footCm: "14.8" },
  { uk: "Kids 8", eu: "25/26", age: "3–4 yrs", footCm: "15.6" },
  { uk: "Kids 9", eu: "27", age: "4–5 yrs", footCm: "16.5" },
  { uk: "Kids 10", eu: "28", age: "5 yrs", footCm: "17.1" },
  { uk: "Kids 11", eu: "29", age: "5–6 yrs", footCm: "17.8" },
  { uk: "Kids 12", eu: "30/31", age: "6–7 yrs", footCm: "18.6" },
  { uk: "Kids 13", eu: "32", age: "7–8 yrs", footCm: "19.4" },
  { uk: "1", eu: "33", age: "8–9 yrs", footCm: "20.3" },
  { uk: "2", eu: "34", age: "9–10 yrs", footCm: "21.1" },
];
/** Kids' shoe sizes in the order they grow (Kids 6 … Kids 13, then UK 1, 2, 3). */
export const KIDS_SHOE_ORDER = [...KIDS_SHOE_SIZE_CHART.map((r) => (r.uk.startsWith("Kids") ? r.uk : "UK " + r.uk)), "UK 3"];

/** A size like "UK 8", "UK 7.5", "EU 42", "US 9" or "Kids 10": the product is footwear. */
export const isShoeSize = (size: string) => /^(kids\s*\d|(uk|eu|us)\s*\d)/i.test(size.trim());

/** Specification rows suggested to sellers listing footwear (they fill in the values). */
export const FOOTWEAR_SPEC_ROWS = ["Upper material", "Sole material", "Closure", "Heel height", "Toe shape", "Occasion", "Care instructions"] as const;
