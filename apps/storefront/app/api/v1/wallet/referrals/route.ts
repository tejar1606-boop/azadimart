import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, customerReferralSummary } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Refer & earn: the shopper's code (after their first order), the reward, and the friends they invited. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    return NextResponse.json(await customerReferralSummary(createDatabase(), session.customerId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
