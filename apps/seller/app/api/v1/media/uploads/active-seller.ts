import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, sellers } from "@azadimart/database";
import { AppError } from "@azadimart/shared";
import { UploadError } from "@azadimart/storage";
import { and, eq } from "drizzle-orm";

/** Product media uploads are limited to approved (ACTIVE) sellers, into their own folder. */
export async function requireActiveSeller(request: Request) {
  const principal = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  const seller = (await createDatabase().select({ id: sellers.id, status: sellers.status }).from(sellers)
    .where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
  if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
  return { userId: principal.userId, sellerId: seller.id, keyPrefix: `product-media/${seller.id}` };
}

export function toAppError(error: unknown): unknown {
  if (!(error instanceof UploadError)) return error;
  return new AppError(error.status === 413 ? "PAYLOAD_TOO_LARGE" : error.status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", error.message);
}
