import { NextResponse } from "next/server";
import { AppError, toApiError } from "@azadimart/shared";

export function GET() {
  const requestId = crypto.randomUUID();
  const { status, body } = toApiError(
    new AppError("UNAUTHORIZED", "Customer session required"),
    requestId,
  );
  return NextResponse.json(body, { status });
}
