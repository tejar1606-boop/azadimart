import { requireApiAccess } from "@azadimart/auth";
import type { SupportRequesterRef } from "@azadimart/database";
import { AppError } from "@azadimart/shared";

/** The signed-in customer, as a support requester. */
export async function requireCustomerRequester(request: Request): Promise<SupportRequesterRef & { type: "CUSTOMER" }> {
  const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
  if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
  return { type: "CUSTOMER", userId: session.userId, customerId: session.customerId };
}
