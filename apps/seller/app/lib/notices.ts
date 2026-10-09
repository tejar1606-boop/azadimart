// Browser-safe: no database imports (used by the sidebar and the Notices page).
export type SellerAttention = {
  storeName: string;
  status: string;
  toShip: number;
  needsWork: number;
  inReview: number;
  lowStock: number;
  newReviews: number;
};

/** How many notices need action (each kind counts once). */
export function noticeCount(a: SellerAttention): number {
  return [a.toShip > 0, a.needsWork > 0, a.lowStock > 0, a.newReviews > 0, a.status !== "ACTIVE"].filter(Boolean).length;
}
