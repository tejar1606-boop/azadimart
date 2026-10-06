import { NextResponse } from "next/server";
import { AppError, toApiError } from "@azadimart/shared";

function unauthorized() {
  const { status, body } = toApiError(
    new AppError("UNAUTHORIZED", "Admin session required"),
    crypto.randomUUID(),
  );
  return NextResponse.json(body, { status });
}

export function GET() {
  return unauthorized();
}
