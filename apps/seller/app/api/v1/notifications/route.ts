import { createDatabase, sellerNotifications } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSeller } from "./seller";

export const dynamic = "force-dynamic";

/** Latest alerts (optionally only newer than ?after=ISO) and the unread count; polled for live pop-ups. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId } = await requireSeller(request);
    const after = new URL(request.url).searchParams.get("after");
    const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
    const db = createDatabase();
    const [items, unread] = await Promise.all([
      db.select({ id: sellerNotifications.id, kind: sellerNotifications.kind, title: sellerNotifications.title, body: sellerNotifications.body, href: sellerNotifications.href, readAt: sellerNotifications.readAt, createdAt: sellerNotifications.createdAt })
        .from(sellerNotifications).where(since ? and(eq(sellerNotifications.sellerId, sellerId), gt(sellerNotifications.createdAt, since)) : eq(sellerNotifications.sellerId, sellerId))
        .orderBy(desc(sellerNotifications.createdAt)).limit(30),
      db.select({ n: count() }).from(sellerNotifications).where(and(eq(sellerNotifications.sellerId, sellerId), isNull(sellerNotifications.readAt))),
    ]);
    return NextResponse.json({ items, unread: Number(unread[0]?.n ?? 0), now: new Date().toISOString() });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
