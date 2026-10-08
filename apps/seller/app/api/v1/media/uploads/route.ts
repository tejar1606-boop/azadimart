import { AppError, mediaUploadRequestSchema, toApiError } from "@azadimart/shared";
import { createUpload, getObjectStore } from "@azadimart/storage";
import { NextResponse } from "next/server";
import { requireActiveSeller, toAppError } from "./active-seller";

/** Step 1 of a direct upload: returns a signed URL the browser PUTs the file to. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const seller = await requireActiveSeller(request);
    const input = mediaUploadRequestSchema.parse(await request.json());
    if (input.purpose !== "PRODUCT_IMAGE" && input.purpose !== "PRODUCT_VIDEO" && input.purpose !== "APLUS_IMAGE") throw new AppError("VALIDATION_ERROR", "Unsupported upload purpose");
    const ticket = await createUpload(getObjectStore(), {
      purpose: input.purpose,
      keyPrefix: seller.keyPrefix,
      userId: seller.userId,
      contentType: input.contentType,
      byteSize: input.byteSize,
      localUploadPath: "/api/v1/media/uploads/local",
    });
    return NextResponse.json({ ok: true, ...ticket });
  } catch (error) {
    const { status, body } = toApiError(toAppError(error), requestId);
    return NextResponse.json(body, { status });
  }
}
