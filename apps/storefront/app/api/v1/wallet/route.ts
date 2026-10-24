import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, walletSummary } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The shopper's wallet: balance, what expires next, history, and the welcome-bonus status. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    return NextResponse.json(await walletSummary(createDatabase(), session.customerId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
