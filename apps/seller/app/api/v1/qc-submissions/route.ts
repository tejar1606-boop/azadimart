import { NextResponse } from "next/server";
import { AppError, toApiError } from "@azadimart/shared";

export function POST() {
  const { status, body } = toApiError(
    new AppError("UNAUTHORIZED", "Seller session required"),
    crypto.randomUUID(),
  );
  return NextResponse.json(body, { status });
}
