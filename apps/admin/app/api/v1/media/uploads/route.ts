import { requireApiAccess } from "@azadimart/auth";
import { AppError, mediaUploadRequestSchema, toApiError } from "@azadimart/shared";
import { createUpload, getObjectStore, UploadError, type UploadPurpose } from "@azadimart/storage";
import { NextResponse } from "next/server";


/** Step 1 of a direct upload: returns a signed URL the browser PUTs the file to. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = mediaUploadRequestSchema.parse(await request.json());
    if (input.purpose !== "SITE_IMAGE" && input.purpose !== "SITE_VIDEO") throw new AppError("VALIDATION_ERROR", "Unsupported upload purpose");
    const ticket = await createUpload(getObjectStore(), {
      purpose: input.purpose as UploadPurpose,
      keyPrefix: "site-media",
      userId: principal.userId,
      contentType: input.contentType,
      byteSize: input.byteSize,
      localUploadPath: "/api/v1/media/uploads/local",
    });
    return NextResponse.json({ ok: true, ...ticket });
  } catch (error) {
    const { status, body } = toApiError(error instanceof UploadError ? new AppError(error.status === 413 ? "PAYLOAD_TOO_LARGE" : error.status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", error.message) : error, requestId);
    return NextResponse.json(body, { status });
  }
}
