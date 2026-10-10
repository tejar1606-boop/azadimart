import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { aadhaarContext, publicAadhaar } from "./shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { record } = await aadhaarContext(request);
    return NextResponse.json({ aadhaar: publicAadhaar(record) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
