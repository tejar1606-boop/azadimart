import { customers, mediaAssets, productReviewMedia, productReviews, type createDatabase } from "@azadimart/database";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

type Db = ReturnType<typeof createDatabase>;

export type ReviewSort = "recent" | "highest" | "lowest" | "photos";
export type ReviewSummary = { count: number; average: number; distribution: Record<1 | 2 | 3 | 4 | 5, number>; photoCount: number };
export type ReviewItem = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  createdAt: string;
  edited: boolean;
  photos: Array<{ id: string; url: string }>;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
};

/** "Priya Sharma" -> "Priya S." (reviews never show full names). */
export function displayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AzadiMart customer";
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** Star breakdown for published reviews of a product. */
export async function loadReviewSummary(db: Db, productId: string): Promise<ReviewSummary> {
  const [rows, photos] = await Promise.all([
    db.select({ rating: productReviews.rating, n: count() }).from(productReviews)
      .where(and(eq(productReviews.productId, productId), eq(productReviews.status, "PUBLISHED"))).groupBy(productReviews.rating),
    db.select({ n: count() }).from(productReviewMedia).innerJoin(productReviews, eq(productReviews.id, productReviewMedia.reviewId))
      .where(and(eq(productReviews.productId, productId), eq(productReviews.status, "PUBLISHED"))),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewSummary["distribution"];
  let total = 0, n = 0;
  for (const r of rows) { distribution[r.rating as 1] = Number(r.n); total += r.rating * Number(r.n); n += Number(r.n); }
  return { count: n, average: n ? Math.round((total / n) * 10) / 10 : 0, distribution, photoCount: Number(photos[0]?.n ?? 0) };
}

/** A page of published reviews (newest, highest, lowest, or with photos first), optionally one star level. */
export async function loadReviews(db: Db, productId: string, options: { sort?: ReviewSort; rating?: number; offset?: number; limit?: number } = {}): Promise<{ items: ReviewItem[]; nextOffset: number | null }> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 30);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters = [eq(productReviews.productId, productId), eq(productReviews.status, "PUBLISHED")];
  if (options.rating && options.rating >= 1 && options.rating <= 5) filters.push(eq(productReviews.rating, options.rating));
  const hasPhotos = sql<number>`exists (select 1 from product_review_media m where m.review_id = ${productReviews.id})`;
  const order = options.sort === "highest" ? [desc(productReviews.rating), desc(productReviews.createdAt)]
    : options.sort === "lowest" ? [asc(productReviews.rating), desc(productReviews.createdAt)]
      : options.sort === "photos" ? [desc(hasPhotos), desc(productReviews.createdAt)]
        : [desc(productReviews.createdAt)];
  const rows = await db.select({
    id: productReviews.id, rating: productReviews.rating, title: productReviews.title, body: productReviews.body,
    fullName: customers.fullName, createdAt: productReviews.createdAt, updatedAt: productReviews.updatedAt,
    sellerReply: productReviews.sellerReply, sellerRepliedAt: productReviews.sellerRepliedAt,
  }).from(productReviews).innerJoin(customers, eq(customers.id, productReviews.customerId))
    .where(and(...filters)).orderBy(...order).limit(limit + 1).offset(offset);
  const page = rows.slice(0, limit);
  const media = page.length ? await db.select({ reviewId: productReviewMedia.reviewId, id: mediaAssets.id, key: mediaAssets.storageKey })
    .from(productReviewMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productReviewMedia.mediaAssetId))
    .where(inArray(productReviewMedia.reviewId, page.map((r) => r.id))).orderBy(asc(productReviewMedia.sortOrder)) : [];
  return {
    items: page.map((r) => ({
      id: r.id, rating: r.rating, title: r.title, body: r.body, authorName: displayName(r.fullName),
      createdAt: r.createdAt.toISOString(), edited: r.updatedAt.getTime() - r.createdAt.getTime() > 60_000,
      photos: media.filter((m) => m.reviewId === r.id).map((m) => ({ id: m.id, url: "/media/" + m.key })),
      sellerReply: r.sellerReply, sellerRepliedAt: r.sellerRepliedAt?.toISOString() ?? null,
    })),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

/** Latest customer photos across a product's published reviews (for the photo strip). */
export async function loadReviewPhotos(db: Db, productId: string, limit = 12) {
  return db.select({ id: mediaAssets.id, key: mediaAssets.storageKey, reviewId: productReviews.id })
    .from(productReviewMedia).innerJoin(productReviews, eq(productReviews.id, productReviewMedia.reviewId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, productReviewMedia.mediaAssetId))
    .where(and(eq(productReviews.productId, productId), eq(productReviews.status, "PUBLISHED")))
    .orderBy(desc(productReviews.createdAt), asc(productReviewMedia.sortOrder)).limit(limit)
    .then((rows) => rows.map((r) => ({ id: r.id, url: "/media/" + r.key, reviewId: r.reviewId })));
}
