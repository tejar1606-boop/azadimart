import { AppError, mediaUploadRequestSchema, toApiError } from "@azadimart/shared";
import { createUpload, getObjectStore } from "@azadimart/storage";
import { NextResponse } from "next/server";
import { limitUploads, requireCustomerUploader, toAppError } from "./customer";

/** Step 1 of a review-photo upload: returns a signed URL the browser PUTs the file to. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const customer = await requireCustomerUploader(request);
    await limitUploads(request, customer.userId);
    const input = mediaUploadRequestSchema.parse(await request.json());
    if (input.purpose !== "REVIEW_IMAGE") throw new AppError("VALIDATION_ERROR", "Unsupported upload purpose");
    const ticket = await createUpload(getObjectStore(), {
      purpose: "REVIEW_IMAGE",
      keyPrefix: customer.keyPrefix,
      userId: customer.userId,
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
