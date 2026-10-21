import { z } from "zod";
import { importedReviewSchema } from "./validation/index";

/**
 * Bulk import of genuine reviews earned on other sites: one CSV row per
 * review (found by the product's SKU) plus one proof file (screenshot or PDF
 * export from the other site) for the whole upload.
 */
export const BULK_REVIEW_LIMITS = { maxRows: 500 } as const;

export const BULK_REVIEW_COLUMNS = [
  { key: "sku", header: "SKU", required: true, hint: "The product's SKU (any of its sizes or colours)" },
  { key: "source", header: "Where it was written", required: true, hint: "e.g. Our website, Amazon, Google" },
  { key: "reviewer", header: "Reviewer name", required: true, hint: "As shown on that site" },
  { key: "stars", header: "Stars", required: true, hint: "1 to 5" },
  { key: "date", header: "Date written", required: true, hint: "YYYY-MM-DD, e.g. 2026-09-01" },
  { key: "title", header: "Title", required: false, hint: "Optional" },
  { key: "text", header: "Review text", required: true, hint: "Word for word, at least 10 characters" },
] as const;
export type BulkReviewKey = (typeof BULK_REVIEW_COLUMNS)[number]["key"];

/** Template the seller/admin downloads: the header plus one example row. */
export const BULK_REVIEW_TEMPLATE: string[][] = [
  BULK_REVIEW_COLUMNS.map((c) => c.header),
  ["YOUR-SKU-001", "Our website", "Priya Sharma", "5", "2026-09-01", "Loved it", "Great quality and arrived well packed. Would buy again."],
];

/** Matches the header row to columns (case and spacing don't matter); lists required columns that are missing. */
export function mapReviewHeaders(header: string[]): { columns: Array<BulkReviewKey | null>; missing: string[] } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const columns = header.map((h) => BULK_REVIEW_COLUMNS.find((c) => norm(c.header) === norm(h) || norm(c.key) === norm(h))?.key ?? null);
  const missing = BULK_REVIEW_COLUMNS.filter((c) => c.required && !columns.includes(c.key)).map((c) => c.header);
  return { columns, missing };
}

/** One review row as sent to the server. */
export const bulkReviewRowSchema = importedReviewSchema.omit({ productId: true, proofAssetId: true }).extend({
  sku: z.string().trim().min(1, "Add the product's SKU").max(80),
});
export type BulkReviewRow = z.infer<typeof bulkReviewRowSchema>;

export const bulkReviewImportSchema = z.object({
  proofAssetId: z.string().uuid("Upload the proof file first"),
  /** true: only check the rows and report problems; nothing is saved. */
  dryRun: z.boolean().default(false),
  rows: z.array(z.unknown()).min(1, "The file has no reviews").max(BULK_REVIEW_LIMITS.maxRows, `Up to ${BULK_REVIEW_LIMITS.maxRows} reviews per file`),
});

/** Admin decision on all of a seller's pending reviews from one upload (they share one proof file). */
export const bulkReviewDecisionSchema = z.object({
  proofAssetId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(300).optional(),
}).refine((v) => v.decision === "APPROVE" || Boolean(v.reason), "Give a reason for rejecting");

/** Turns CSV cells into a row for the server, with friendly messages for obvious mistakes. */
export function readReviewCsvRow(cells: Partial<Record<BulkReviewKey, string>>): Record<string, unknown> {
  const stars = Number((cells.stars ?? "").replace(/[^\d.]/g, ""));
  return {
    sku: cells.sku ?? "", sourceName: cells.source ?? "", authorName: cells.reviewer ?? "",
    rating: Number.isInteger(stars) ? stars : NaN, reviewedAt: cells.date ?? "", title: cells.title ?? "", body: cells.text ?? "",
  };
}
