import { createDatabase, orderItems, orders, pushSubscriptions, sellerNotifications, sellerSettings, settleClosedAuctions } from "@azadimart/database";
import { eq } from "drizzle-orm";
import webpush from "web-push";

type Db = ReturnType<typeof createDatabase>;

export type SellerAlertKind = "NEW_ORDER" | "SHIP_BY_REMINDER" | "ORDER_LATE" | "ORDER_AUTO_CANCELLED" | "ORDER_CANCELLED_BY_CUSTOMER" | "ORDER_CANCELLED_BY_ADMIN" | "PAYOUT_PAID" | "PAYOUT_ON_HOLD" | "AD_OUTBID" | "AD_WON" | "AD_LOST" | "AD_CHARGED" | "AD_REVIEWED";
export type SellerAlertPreferences = { newOrders: boolean; reminders: boolean; cancellations: boolean; payouts: boolean; ads: boolean };
export const DEFAULT_ALERT_PREFERENCES: SellerAlertPreferences = { newOrders: true, reminders: true, cancellations: true, payouts: true, ads: true };

const CATEGORY: Record<SellerAlertKind, keyof SellerAlertPreferences> = {
  NEW_ORDER: "newOrders",
  SHIP_BY_REMINDER: "reminders",
  ORDER_LATE: "reminders",
  ORDER_AUTO_CANCELLED: "cancellations",
  ORDER_CANCELLED_BY_CUSTOMER: "cancellations",
  ORDER_CANCELLED_BY_ADMIN: "cancellations",
  PAYOUT_PAID: "payouts",
  PAYOUT_ON_HOLD: "payouts",
  AD_OUTBID: "ads",
  AD_WON: "ads",
  AD_LOST: "ads",
  AD_CHARGED: "ads",
  AD_REVIEWED: "ads",
};

/** Whether the seller wants a browser push for this kind of alert (it's always kept in Notices). */
export const wantsPush = (prefs: SellerAlertPreferences, kind: SellerAlertKind) => prefs[CATEGORY[kind]];

/** "Kitchen Set × 2 and 1 more" */
export const orderLinesSummary = (lines: Array<{ title: string; quantity: number }>) => `${lines[0]!.title} × ${lines[0]!.quantity}${lines.length > 1 ? ` and ${lines.length - 1} more` : ""}`;

/** The seller's alert choices (missing keys default to on). */
export async function alertPreferences(db: Db, sellerId: string): Promise<SellerAlertPreferences> {
  const row = (await db.select({ settings: sellerSettings.notificationSettings }).from(sellerSettings).where(eq(sellerSettings.sellerId, sellerId)).limit(1))[0];
  return { ...DEFAULT_ALERT_PREFERENCES, ...(row?.settings as Partial<SellerAlertPreferences> | undefined) };
}

let vapidReady: boolean | null = null;
function pushConfigured(): boolean {
  if (vapidReady !== null) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  vapidReady = Boolean(publicKey && privateKey);
  if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@azadimart.com", publicKey!, privateKey!);
  return vapidReady;
}

/** Sends a browser push to every device the seller turned alerts on for. Expired subscriptions are removed. */
async function pushToSeller(db: Db, sellerId: string, payload: { title: string; body?: string | null; href?: string | null; tag?: string }) {
  if (!pushConfigured()) return;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.sellerId, sellerId));
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, timeout: 5000 });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
    }
  }));
}

/**
 * Records an alert for a seller (shown in Notices and as a live pop-up) and,
 * if the seller wants this kind, sends it as a browser push. A dedupe key
 * (e.g. NEW_ORDER:<orderId>) makes it safe to call more than once.
 * Never throws: alerts must not break checkout or cancellation.
 */
export async function notifySeller(db: Db, input: { sellerId: string; kind: SellerAlertKind; title: string; body?: string; href?: string; dedupeKey?: string }): Promise<boolean> {
  try {
    const inserted = await db.insert(sellerNotifications).values({
      sellerId: input.sellerId, kind: input.kind, title: input.title, body: input.body ?? null, href: input.href ?? null, dedupeKey: input.dedupeKey ?? null,
    }).onConflictDoNothing().returning({ id: sellerNotifications.id });
    if (!inserted.length) return false;
    const prefs = await alertPreferences(db, input.sellerId);
    if (wantsPush(prefs, input.kind)) await pushToSeller(db, input.sellerId, { title: input.title, body: input.body, href: input.href, tag: input.dedupeKey });
    return true;
  } catch {
    return false;
  }
}

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const day = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Lines of an order grouped by seller (title, quantity, value). */
async function linesBySeller(db: Db, orderId: string) {
  const lines = await db.select({ sellerId: orderItems.sellerId, title: orderItems.title, quantity: orderItems.quantity, unitPricePaise: orderItems.unitPricePaise }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const bySeller = new Map<string, typeof lines>();
  for (const line of lines) bySeller.set(line.sellerId, [...(bySeller.get(line.sellerId) ?? []), line]);
  return bySeller;
}
const summary = orderLinesSummary;

/** "New order" alert to every seller in an order (call after the checkout transaction commits). */
export async function notifySellersOfNewOrder(db: Db, orderId: string): Promise<void> {
  try {
    const order = (await db.select({ orderNumber: orders.orderNumber, shipByAt: orders.shipByAt }).from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order) return;
    for (const [sellerId, lines] of await linesBySeller(db, orderId)) {
      const value = lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
      await notifySeller(db, {
        sellerId, kind: "NEW_ORDER", dedupeKey: `NEW_ORDER:${orderId}`, href: "/orders",
        title: `New order ${order.orderNumber} · ${money(value)}`,
        body: `${summary(lines)}.${order.shipByAt ? ` Ship by ${day(order.shipByAt)}.` : ""}`,
      });
    }
  } catch { /* alerts must never break checkout */ }
}

/** Tell the order's sellers it was cancelled (by the customer, an admin or automatically). */
export async function notifySellersOfCancellation(db: Db, orderId: string, by: "CUSTOMER" | "ADMIN" | "SYSTEM", reason?: string | null, exceptSellerId?: string): Promise<void> {
  try {
    const order = (await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order) return;
    const kind: SellerAlertKind = by === "CUSTOMER" ? "ORDER_CANCELLED_BY_CUSTOMER" : by === "ADMIN" ? "ORDER_CANCELLED_BY_ADMIN" : "ORDER_AUTO_CANCELLED";
    const who = by === "CUSTOMER" ? "the customer" : by === "ADMIN" ? "AzadiMart" : "AzadiMart because it wasn't shipped in time";
    for (const [sellerId, lines] of await linesBySeller(db, orderId)) {
      if (sellerId === exceptSellerId) continue;
      await notifySeller(db, {
        sellerId, kind, dedupeKey: `CANCELLED:${orderId}`, href: "/orders",
        title: `Order ${order.orderNumber} was cancelled`,
        body: `Cancelled by ${who}${reason ? `: ${reason}` : ""}. Don't ship ${summary(lines)}.`,
      });
    }
  } catch { /* never block cancellation */ }
}


/** Tells sellers what happened in ad auctions (from @azadimart/database ad functions). */
export async function notifyAdEvents(db: Db, events: Array<{ kind: "OUTBID" | "WON" | "LOST" | "CHARGED"; sellerId: string; slotName: string; day: string; amountPaise: number; bidId: string }>): Promise<void> {
  const when = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  for (const e of events) {
    const text = {
      OUTBID: { kind: "AD_OUTBID" as const, title: `You've been outbid for ${when(e.day)}`, body: `Another seller bid more than your ${money(e.amountPaise)} for ${e.slotName}. Bid again before bidding closes.` },
      WON: { kind: "AD_WON" as const, title: `${e.slotName} is yours on ${when(e.day)}`, body: `Booked for ${money(e.amountPaise)}. Make sure your ad is approved before the day starts; you're charged only if it runs.` },
      LOST: { kind: "AD_LOST" as const, title: `${when(e.day)} went to another seller`, body: `Your bid for ${e.slotName} didn't win. Other days are still open.` },
      CHARGED: { kind: "AD_CHARGED" as const, title: `Ad charge ${money(e.amountPaise)} for ${when(e.day)}`, body: `${e.slotName}. It will be taken from your next payment.` },
    }[e.kind];
    await notifySeller(db, { sellerId: e.sellerId, kind: text.kind, dedupeKey: `AD_${e.kind}:${e.bidId}`, href: "/ads", title: text.title, body: text.body });
  }
}

/** Closes ad auctions whose bidding has ended and tells the sellers. Call before showing calendars or ads. */
export async function settleAdAuctions(db: Db, now = new Date()): Promise<void> {
  try { await notifyAdEvents(db, await settleClosedAuctions(db, now)); } catch { /* never block a page on this */ }
}
