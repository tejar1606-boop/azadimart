import { toApiError } from "@azadimart/shared";
import { getObjectStore, receiveLocalUpload } from "@azadimart/storage";
import { NextResponse } from "next/server";
import { requireCustomerUploader, toAppError } from "../customer";

/** Development only (local storage driver): receives the PUT that would otherwise go to S3/R2. */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const seller = await requireCustomerUploader(request);
    await receiveLocalUpload(getObjectStore(), new URL(request.url).searchParams.get("token") ?? "", seller.userId, request.body);
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    const { status, body } = toApiError(toAppError(error), requestId);
    return NextResponse.json(body, { status });
  }
}
