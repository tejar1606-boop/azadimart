import { requireStaff } from "@azadimart/auth";
import { createDatabase, sellerWalletTopUps } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { PAYMENT_PROOF_PREFIX, getObjectStore } from "@azadimart/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** The private payment screenshot a seller sent with a wallet top-up (finance staff only). */
export async function GET(request: Request, { params }: { params: Promise<{ topUpId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const { topUpId } = await params;
    if (!uuidSchema.safeParse(topUpId).success) throw new AppError("NOT_FOUND", "Top-up request not found");
    const proof = (await createDatabase().select({ key: sellerWalletTopUps.proofKey, mimeType: sellerWalletTopUps.proofMimeType }).from(sellerWalletTopUps).where(eq(sellerWalletTopUps.id, topUpId)).limit(1))[0];
    if (!proof?.key || !proof.mimeType || !proof.key.startsWith(PAYMENT_PROOF_PREFIX)) throw new AppError("NOT_FOUND", "No payment screenshot for this request");
    const bytes = await getObjectStore().get(proof.key);
    if (!bytes) throw new AppError("NOT_FOUND", "The screenshot file is missing");
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": proof.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
