import { requireApiAccess } from "@azadimart/auth";
import type { SupportRequesterRef } from "@azadimart/database";
import { AppError } from "@azadimart/shared";

/** The signed-in seller, as a support requester. */
export async function requireSellerRequester(request: Request): Promise<SupportRequesterRef & { type: "SELLER" }> {
  const session = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!session.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  return { type: "SELLER", userId: session.userId, sellerId: session.sellerId };
}
