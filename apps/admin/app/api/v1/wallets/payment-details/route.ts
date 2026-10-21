import { requireStaff } from "@azadimart/auth";
import { createDatabase, getPlatformSetting, setPlatformSetting } from "@azadimart/database";
import { WALLET_PAYMENT_DETAILS_KEY, toApiError, walletPaymentDetailsSchema, type WalletPaymentDetails } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** LOIMART's bank account / UPI ID that sellers pay wallet top-ups to. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    return NextResponse.json({ details: await getPlatformSetting<WalletPaymentDetails>(createDatabase(), WALLET_PAYMENT_DETAILS_KEY) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const details = walletPaymentDetailsSchema.parse(await request.json());
    await setPlatformSetting(createDatabase(), WALLET_PAYMENT_DETAILS_KEY, details, principal.userId);
    return NextResponse.json({ ok: true, details });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
