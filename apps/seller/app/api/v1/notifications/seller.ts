import { requireApiAccess } from "@azadimart/auth";
import { AppError } from "@azadimart/shared";

/** Signed-in seller for notification endpoints. */
export async function requireSeller(request: Request) {
  const principal = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  return { userId: principal.userId, sellerId: principal.sellerId };
}
