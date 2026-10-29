import { requireStaff } from "@azadimart/auth";
import { createDatabase, lookupCaller } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Who a number belongs to (customer / seller, recent orders, open tickets), for the dialler. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "support");
    const phone = new URL(request.url).searchParams.get("phone") ?? "";
    return NextResponse.json(await lookupCaller(createDatabase(), phone));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
