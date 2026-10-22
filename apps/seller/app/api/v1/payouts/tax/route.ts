import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, sellerTaxSummary } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** TCS and TDS LOIMART deducted from this seller's payouts, month by month (last 12 months). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    return NextResponse.json({ months: await sellerTaxSummary(createDatabase(), principal.sellerId) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
