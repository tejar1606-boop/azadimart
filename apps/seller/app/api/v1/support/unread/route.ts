import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, requesterUnreadCount } from "@azadimart/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** How many of the seller's tickets have an unread support reply. */
export async function GET(request: Request) {
  try {
    const db = createDatabase();
    const p = await getSessionPrincipal(request, db);
    if (p?.role !== "SELLER" || !p.sellerId) return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: await requesterUnreadCount(db, { type: "SELLER", userId: p.userId, sellerId: p.sellerId }) });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
