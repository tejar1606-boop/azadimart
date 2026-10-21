import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase, requestWalletTopUp } from "@azadimart/database";
import { AppError, toApiError, walletTopUpRequestSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Seller tells LOIMART they paid (amount + bank/UPI reference); an admin credits the wallet after checking. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    await enforceRateLimit(db, request, "supportTicket", { subject: principal.userId });
    const input = walletTopUpRequestSchema.parse(await request.json());
    const id = await requestWalletTopUp(db, { ...input, sellerId: principal.sellerId, userId: principal.userId });
    return NextResponse.json({ ok: true, id, status: "PENDING" }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
