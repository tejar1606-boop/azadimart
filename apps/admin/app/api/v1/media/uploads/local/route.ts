import { requireApiAccess } from "@azadimart/auth";
import { AppError, toApiError } from "@azadimart/shared";
import { getObjectStore, receiveLocalUpload, UploadError } from "@azadimart/storage";
import { NextResponse } from "next/server";

/** Development only (local storage driver): receives the PUT that would otherwise go to S3/R2. */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const token = new URL(request.url).searchParams.get("token") ?? "";
    await receiveLocalUpload(getObjectStore(), token, principal.userId, request.body);
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    const { status, body } = toApiError(error instanceof UploadError ? new AppError(error.status === 413 ? "PAYLOAD_TOO_LARGE" : error.status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", error.message) : error, requestId);
    return NextResponse.json(body, { status });
  }
}
