import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, requesterUnreadCount } from "@azadimart/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** How many of the customer's tickets have a reply they haven't read (0 for guests). */
export async function GET(request: Request) {
  try {
    const db = createDatabase();
    const p = await getSessionPrincipal(request, db);
    if (p?.role !== "CUSTOMER" || !p.customerId) return NextResponse.json({ count: 0, signedIn: false });
    return NextResponse.json({ count: await requesterUnreadCount(db, { type: "CUSTOMER", userId: p.userId, customerId: p.customerId }), signedIn: true });
  } catch {
    return NextResponse.json({ count: 0, signedIn: false });
  }
}
