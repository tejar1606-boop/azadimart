import { NextResponse } from "next/server";
import { AppError, toApiError } from "@azadimart/shared";

export function GET() {
  const { status, body } = toApiError(
    new AppError("UNAUTHORIZED", "Admin session required"),
    crypto.randomUUID(),
  );
  return NextResponse.json(body, { status });
}
