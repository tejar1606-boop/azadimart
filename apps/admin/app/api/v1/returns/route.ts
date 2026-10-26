import { requireStaff } from "@azadimart/auth";
import { createDatabase, listReturns, type ReturnStatus } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const STATUSES = ["OPEN", "ALL", "REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUNDED", "REJECTED"] as const;

/** Every return across sellers: by status (OPEN = still to finish), search, pages of 50. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "orders");
    const url = new URL(request.url);
    const asked = url.searchParams.get("status") ?? "OPEN";
    const status = (STATUSES as readonly string[]).includes(asked) ? (asked as ReturnStatus | "OPEN" | "ALL") : "OPEN";
    const result = await listReturns(createDatabase(), { status, q: url.searchParams.get("q") ?? "", page: Number(url.searchParams.get("page")) || 1 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
