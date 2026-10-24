import { requireApiAccess } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const session = await requireApiAccess(request, "seller", ["SELLER"], createDatabase());
    return NextResponse.json(
      {
        ok: true,
        userId: session.userId,
        role: session.role,
        audience: "seller",
        sellerId: session.sellerId ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
