import { requireStaff } from "@azadimart/auth";
import { createDatabase, decideWalletTopUp } from "@azadimart/database";
import { AppError, toApiError, uuidSchema, walletTopUpDecisionSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Approve (credit the wallet) or reject a seller's top-up request after checking the money arrived. */
export async function POST(request: Request, { params }: { params: Promise<{ topUpId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const { topUpId } = await params;
    if (!uuidSchema.safeParse(topUpId).success) throw new AppError("NOT_FOUND", "Top-up request not found");
    const input = walletTopUpDecisionSchema.parse(await request.json());
    const result = await decideWalletTopUp(createDatabase(), { topUpId, ...input, adminUserId: principal.userId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
