import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, sellers } from "@azadimart/database";
import { AppError } from "@azadimart/shared";
import { eq } from "drizzle-orm";

/** Ads are for active (verified) sellers only. */
export async function requireAdSeller(request: Request) {
  const principal = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  const db = createDatabase();
  const seller = (await db.select({ status: sellers.status }).from(sellers).where(eq(sellers.id, principal.sellerId)).limit(1))[0];
  if (seller?.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Ads are available once your seller account is verified");
  return { db, userId: principal.userId, sellerId: principal.sellerId };
}
