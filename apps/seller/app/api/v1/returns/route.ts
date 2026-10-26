import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, listReturns, type ReturnStatus } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const STATUSES = ["OPEN", "LATE", "ALL", "REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUNDED", "REJECTED"] as const;

/** This seller's returns, by status and search. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const url = new URL(request.url);
    const asked = url.searchParams.get("status") ?? "OPEN";
    const status = (STATUSES as readonly string[]).includes(asked) ? (asked as ReturnStatus | "OPEN" | "LATE" | "ALL") : "OPEN";
    const result = await listReturns(createDatabase(), { sellerId: principal.sellerId, status, q: url.searchParams.get("q") ?? "", page: Number(url.searchParams.get("page")) || 1 });
    // Sellers see the customer's first name and city only (the courier has the full address).
    const items = result.items.map(({ customerName, ...r }) => ({ ...r, customerName: customerName.split(" ")[0] ?? "" }));
    return NextResponse.json({ ...result, items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
