// Browser-safe: no database imports (used by the sidebar and the Notices page).
export type SellerAttention = {
  storeName: string;
  status: string;
  toShip: number;
  /** Returns waiting for the seller: to approve, to book pickup, or to receive. */
  returnsToAct?: number;
  needsWork: number;
  inReview: number;
  lowStock: number;
  newReviews: number;
  aadhaarVerified: boolean;
  bankStatus: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  /** Support tickets with a reply the seller hasn't read. */
  supportUnread: number;
};

/** How many notices need action (each kind counts once). */
export function noticeCount(a: SellerAttention): number {
  return [a.toShip > 0, (a.returnsToAct ?? 0) > 0, a.needsWork > 0, a.lowStock > 0, a.newReviews > 0, a.status !== "ACTIVE" || !a.aadhaarVerified, a.status === "ACTIVE" && (a.bankStatus === "NONE" || a.bankStatus === "REJECTED")].filter(Boolean).length;
}
