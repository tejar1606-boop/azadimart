import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { AppError } from "@azadimart/shared";
import { UploadError } from "@azadimart/storage";

/** Signed-in customer whose review photos live under review-media/<customerId>. */
export async function requireCustomerUploader(request: Request) {
  const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
  if (!principal.customerId) throw new AppError("FORBIDDEN", "Customer profile required");
  return { userId: principal.userId, customerId: principal.customerId, keyPrefix: "review-media/" + principal.customerId };
}

export async function limitUploads(request: Request, userId: string) {
  await enforceRateLimit(createDatabase(), request, "upload", { subject: userId });
}

export function toAppError(error: unknown) {
  return error instanceof UploadError ? new AppError("VALIDATION_ERROR", error.message) : error;
}
