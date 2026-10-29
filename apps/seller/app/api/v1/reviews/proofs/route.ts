import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase, recordReviewProof } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { ReviewProofError, getObjectStore, saveReviewProof } from "@azadimart/storage";
import { NextResponse } from "next/server";

/** Upload the screenshot of an imported review (multipart "file"); stored privately. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    await enforceRateLimit(createDatabase(), request, "upload", { subject: principal.userId });
    const form = await request.formData().catch(() => { throw new AppError("VALIDATION_ERROR", "Upload must be multipart/form-data"); });
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "Choose a screenshot");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await saveReviewProof(getObjectStore(), principal.userId, bytes).catch((e) => { throw e instanceof ReviewProofError ? new AppError("VALIDATION_ERROR", e.message) : e; });
    const proofAssetId = await recordReviewProof(createDatabase(), principal.userId, { ...saved, byteSize: bytes.length });
    return NextResponse.json({ ok: true, proofAssetId }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
