import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, loadSettlementStatement } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** The settlement statement for one of the seller's own payouts. */
export async function GET(request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { payoutId } = await params;
    if (!uuidSchema.safeParse(payoutId).success) throw new AppError("NOT_FOUND", "Settlement not found");
    const statement = await loadSettlementStatement(createDatabase(), payoutId, principal.sellerId);
    if (!statement) throw new AppError("NOT_FOUND", "Settlement not found");
    return NextResponse.json({ statement });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
