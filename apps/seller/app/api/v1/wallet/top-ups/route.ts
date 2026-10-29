import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase, requestWalletTopUp } from "@azadimart/database";
import { AppError, toApiError, walletTopUpRequestSchema } from "@azadimart/shared";
import { PaymentProofError, getObjectStore, savePaymentProof } from "@azadimart/storage";
import { NextResponse } from "next/server";

/**
 * Seller tells LOIMART they paid: amount, bank/UPI reference and a screenshot
 * of the payment (required; multipart "amountPaise", "reference", "file").
 * An admin credits the wallet after checking.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    await enforceRateLimit(db, request, "supportTicket", { subject: principal.userId });
    const form = await request.formData().catch(() => { throw new AppError("VALIDATION_ERROR", "Attach the payment screenshot"); });
    const input = walletTopUpRequestSchema.parse({ amountPaise: Number(form.get("amountPaise")), reference: String(form.get("reference") ?? "") });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION_ERROR", "Attach the payment screenshot");
    const store = getObjectStore();
    const proof = await savePaymentProof(store, principal.sellerId, new Uint8Array(await file.arrayBuffer()))
      .catch((e) => { throw e instanceof PaymentProofError ? new AppError("VALIDATION_ERROR", e.message) : e; });
    try {
      const id = await requestWalletTopUp(db, { ...input, sellerId: principal.sellerId, userId: principal.userId, proof });
      return NextResponse.json({ ok: true, id, status: "PENDING" }, { status: 201 });
    } catch (error) {
      // Not saved (e.g. reference already used, wallet full): don't keep the screenshot.
      await store.delete(proof.key).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
