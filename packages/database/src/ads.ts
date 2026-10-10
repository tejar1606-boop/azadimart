import { AD_BOOKING_DAYS_AHEAD, AD_DEFAULT_CREDIT_LIMIT_PAISE, adChargeFor, addDays, biddingClosesAt, istDayKey, minimumNextBid } from "@azadimart/shared";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "./client";
import { adBids, adCampaigns, adSlotClosedDays, adSlots, sellerCharges } from "./schema/ads";
import { sellers } from "./schema/sellers";
import { unpaidSettlementLines } from "./settlements";

/**
 * Ad auctions. Each slot-day is its own auction (see @azadimart/shared ads).
 * Functions return "events" (outbid, won, lost, charged) so the caller can
 * alert sellers; this package doesn't send notifications itself.
 */
export type AdEvent = { kind: "OUTBID" | "WON" | "LOST" | "CHARGED"; sellerId: string; slotName: string; day: string; amountPaise: number; bidId: string };
type Slot = typeof adSlots.$inferSelect;

/** Turns top bids whose bidding has closed into wins, and the rest into losses. Safe to call often. */
export async function settleClosedAuctions(db: Database, now = new Date()): Promise<AdEvent[]> {
  const today = istDayKey(now);
  const open = await db.select({ bid: adBids, slot: adSlots }).from(adBids).innerJoin(adSlots, eq(adSlots.id, adBids.slotId))
    .where(and(eq(adBids.status, "ACTIVE"), lte(adBids.day, addDays(today, 8))));
  const events: AdEvent[] = [];
  for (const { bid, slot } of open) {
    if (biddingClosesAt(bid.day, slot.closeHoursBefore) > now) continue;
    const won = (await db.update(adBids).set({ status: "WON", updatedAt: now }).where(and(eq(adBids.id, bid.id), eq(adBids.status, "ACTIVE"))).returning({ id: adBids.id }))[0];
    if (!won) continue;
    events.push({ kind: "WON", sellerId: bid.sellerId, slotName: slot.name, day: bid.day, amountPaise: bid.amountPaise, bidId: bid.id });
    const losers = await db.update(adBids).set({ status: "LOST", updatedAt: now })
      .where(and(eq(adBids.slotId, bid.slotId), eq(adBids.day, bid.day), eq(adBids.status, "OUTBID"))).returning();
    for (const l of losers) if (l.sellerId !== bid.sellerId) events.push({ kind: "LOST", sellerId: l.sellerId, slotName: slot.name, day: l.day, amountPaise: l.amountPaise, bidId: l.id });
  }
  return dedupeLosses(events);
}

// A seller who bid several times on the same day hears about the loss once.
function dedupeLosses(events: AdEvent[]) {
  const seen = new Set<string>();
  return events.filter((e) => e.kind !== "LOST" || (!seen.has(e.sellerId + e.day) && seen.add(e.sellerId + e.day)));
}

export type AdDay = {
  day: string;
  status: "OPEN" | "BIDDING" | "BOOKED" | "CLOSED" | "UNAVAILABLE";
  closesAt: string;
  topBidPaise: number | null;
  bidCount: number;
  minimumBidPaise: number;
  buyNowPaise: number | null;
  mine: { status: string; amountPaise: number } | null;
};

/** The booking calendar for a slot (call settleClosedAuctions first). Other sellers' names are never shown. */
export async function adCalendar(db: Database, slotId: string, options: { sellerId?: string; days?: number; now?: Date } = {}): Promise<{ slot: Slot; days: AdDay[] } | null> {
  const now = options.now ?? new Date();
  const slot = (await db.select().from(adSlots).where(eq(adSlots.id, slotId)).limit(1))[0];
  if (!slot) return null;
  const first = istDayKey(now), last = addDays(first, (options.days ?? AD_BOOKING_DAYS_AHEAD) - 1);
  const [bids, closed] = await Promise.all([
    db.select().from(adBids).where(and(eq(adBids.slotId, slotId), gte(adBids.day, first), lte(adBids.day, last), inArray(adBids.status, ["ACTIVE", "OUTBID", "WON", "LOST"]))),
    db.select({ day: adSlotClosedDays.day }).from(adSlotClosedDays).where(and(eq(adSlotClosedDays.slotId, slotId), gte(adSlotClosedDays.day, first), lte(adSlotClosedDays.day, last))),
  ]);
  const closedDays = new Set(closed.map((c) => c.day));
  const days: AdDay[] = [];
  for (let i = 0; i < (options.days ?? AD_BOOKING_DAYS_AHEAD); i++) {
    const day = addDays(first, i);
    const forDay = bids.filter((b) => b.day === day);
    const winner = forDay.find((b) => b.status === "WON");
    const top = forDay.find((b) => b.status === "ACTIVE");
    const closesAt = biddingClosesAt(day, slot.closeHoursBefore);
    const mineList = options.sellerId ? forDay.filter((b) => b.sellerId === options.sellerId).sort((a, b) => b.amountPaise - a.amountPaise) : [];
    const mine = mineList.find((b) => b.status === "WON" || b.status === "ACTIVE") ?? mineList[0];
    days.push({
      day,
      status: winner ? "BOOKED" : closedDays.has(day) || !slot.isActive ? "CLOSED" : closesAt <= now ? "UNAVAILABLE" : top ? "BIDDING" : "OPEN",
      closesAt: closesAt.toISOString(),
      topBidPaise: top?.amountPaise ?? null,
      bidCount: new Set(forDay.map((b) => b.sellerId)).size,
      minimumBidPaise: minimumNextBid(slot, top?.amountPaise ?? null),
      buyNowPaise: slot.buyNowPricePaise != null && (!top || top.amountPaise < slot.buyNowPricePaise) ? slot.buyNowPricePaise : null,
      mine: mine ? { status: mine.status, amountPaise: mine.amountPaise } : null,
    });
  }
  return { slot, days };
}

/**
 * What a seller can still commit to ads: their upcoming earnings (delivered
 * orders not yet paid out) plus their ad credit, minus what they already owe
 * or have committed (charges not yet taken, booked days not yet charged and
 * live top bids), all including GST. Ad charges are taken from payouts, so
 * this keeps a seller from running up charges they can't cover.
 */
export async function adBudget(db: Database, sellerId: string, now = new Date()) {
  const [seller, lines, pending, committed] = await Promise.all([
    db.select({ limit: sellers.adCreditLimitPaise }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
    unpaidSettlementLines(db, { sellerId }),
    db.select({ total: sql<number>`coalesce(sum(${sellerCharges.amountPaise}), 0)::int` }).from(sellerCharges).where(and(eq(sellerCharges.sellerId, sellerId), eq(sellerCharges.status, "PENDING"))),
    db.select({ total: sql<number>`coalesce(sum(${adBids.amountPaise}), 0)::int` }).from(adBids)
      .where(and(eq(adBids.sellerId, sellerId), inArray(adBids.status, ["ACTIVE", "WON"]), gte(adBids.day, addDays(istDayKey(now), -3)),
        sql`not exists (select 1 from seller_charges c where c.kind = 'AD' and c.reference_id = ${adBids.id})`)),
  ]);
  const creditLimitPaise = seller?.limit ?? AD_DEFAULT_CREDIT_LIMIT_PAISE;
  const earningsPaise = lines.filter((l) => !l.openReturn).reduce((s, l) => s + l.breakdown.netPaise, 0);
  const usedPaise = (pending[0]?.total ?? 0) + adChargeFor(committed[0]?.total ?? 0).totalPaise;
  return { creditLimitPaise, earningsPaise, usedPaise, availablePaise: Math.max(0, earningsPaise + creditLimitPaise - usedPaise) };
}

export type BidResult = { day: string; ok: boolean; status?: "ACTIVE" | "WON"; amountPaise?: number; reason?: string };

/** Places a bid (or books instantly) on each requested day. Each day succeeds or fails on its own. */
export async function placeAdBids(db: Database, input: { sellerId: string; campaignId: string; days: string[]; mode: "BID" | "BUY_NOW"; amountPaise?: number; now?: Date }): Promise<{ results: BidResult[]; events: AdEvent[] }> {
  const now = input.now ?? new Date();
  const events = await settleClosedAuctions(db, now);
  const campaign = (await db.select().from(adCampaigns).where(and(eq(adCampaigns.id, input.campaignId), eq(adCampaigns.sellerId, input.sellerId))).limit(1))[0];
  if (!campaign) return { results: input.days.map((day) => ({ day, ok: false, reason: "Ad not found" })), events };
  if (campaign.status === "REJECTED") return { results: input.days.map((day) => ({ day, ok: false, reason: "This ad was rejected; update it first" })), events };
  const slot = (await db.select().from(adSlots).where(eq(adSlots.id, campaign.slotId)).limit(1))[0]!;
  const today = istDayKey(now), lastDay = addDays(today, AD_BOOKING_DAYS_AHEAD - 1);
  const results: BidResult[] = [];
  let available = (await adBudget(db, input.sellerId, now)).availablePaise;

  for (const day of [...input.days].sort()) {
    const fail = (reason: string) => results.push({ day, ok: false, reason });
    if (!slot.isActive) { fail("This ad space isn't on sale right now"); continue; }
    if (day < today || day > lastDay) { fail(`Pick a day within the next ${AD_BOOKING_DAYS_AHEAD} days`); continue; }
    if (biddingClosesAt(day, slot.closeHoursBefore) <= now) { fail("Bidding for this day has closed"); continue; }
    let extra = 0;
    // Budget check (with GST), once the day is known to be available: raising your own top bid only needs the difference.
    const overBudget = (price: number, own: number) => {
      extra = adChargeFor(Math.max(0, price - own)).totalPaise;
      return extra > available ? { ok: false as const, reason: `This is more than your ad budget (₹${Math.floor(available / 100).toLocaleString("en-IN")} left, including GST). It grows with your sales; AzadiMart can also raise your limit.` } : null;
    };
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${slot.id + ":" + day}, 0))`);
        const closed = await tx.select({ id: adSlotClosedDays.id }).from(adSlotClosedDays).where(and(eq(adSlotClosedDays.slotId, slot.id), eq(adSlotClosedDays.day, day))).limit(1);
        if (closed.length) return { ok: false as const, reason: "Not available on this day" };
        const current = await tx.select().from(adBids).where(and(eq(adBids.slotId, slot.id), eq(adBids.day, day), inArray(adBids.status, ["ACTIVE", "WON"])));
        if (current.some((b) => b.status === "WON")) return { ok: false as const, reason: "Already booked" };
        const top = current.find((b) => b.status === "ACTIVE");
        const dayEvents: AdEvent[] = [];
        const beat = async (status: "OUTBID" | "LOST") => {
          if (!top) return;
          await tx.update(adBids).set({ status, updatedAt: now }).where(eq(adBids.id, top.id));
          if (top.sellerId !== input.sellerId) dayEvents.push({ kind: status === "LOST" ? "LOST" : "OUTBID", sellerId: top.sellerId, slotName: slot.name, day, amountPaise: top.amountPaise, bidId: top.id });
        };

        if (input.mode === "BUY_NOW") {
          if (slot.buyNowPricePaise == null) return { ok: false as const, reason: "Book now isn't offered for this ad space; place a bid" };
          if (top && top.amountPaise >= slot.buyNowPricePaise) return { ok: false as const, reason: "Bids are already above the book-now price; place a higher bid" };
          const budget = overBudget(slot.buyNowPricePaise, top?.sellerId === input.sellerId ? top.amountPaise : 0);
          if (budget) return budget;
          await beat("LOST");
          const others = await tx.update(adBids).set({ status: "LOST", updatedAt: now })
            .where(and(eq(adBids.slotId, slot.id), eq(adBids.day, day), eq(adBids.status, "OUTBID"))).returning();
          for (const o of others) if (o.sellerId !== input.sellerId) dayEvents.push({ kind: "LOST", sellerId: o.sellerId, slotName: slot.name, day, amountPaise: o.amountPaise, bidId: o.id });
          const [won] = await tx.insert(adBids).values({ slotId: slot.id, campaignId: campaign.id, sellerId: input.sellerId, day, amountPaise: slot.buyNowPricePaise, kind: "BUY_NOW", status: "WON" }).returning({ id: adBids.id });
          dayEvents.push({ kind: "WON", sellerId: input.sellerId, slotName: slot.name, day, amountPaise: slot.buyNowPricePaise, bidId: won!.id });
          return { ok: true as const, status: "WON" as const, amountPaise: slot.buyNowPricePaise, events: dayEvents };
        }

        const amount = input.amountPaise ?? 0;
        if (top?.sellerId === input.sellerId) {
          if (amount <= top.amountPaise) return { ok: false as const, reason: "You're already the top bidder; enter a higher amount to raise it" };
          const budget = overBudget(amount, top.amountPaise);
          if (budget) return budget;
          await tx.update(adBids).set({ amountPaise: amount, campaignId: campaign.id, updatedAt: now }).where(eq(adBids.id, top.id));
          return { ok: true as const, status: "ACTIVE" as const, amountPaise: amount, events: dayEvents };
        }
        const minimum = minimumNextBid(slot, top?.amountPaise ?? null);
        if (amount < minimum) return { ok: false as const, reason: `Bid at least ₹${(minimum / 100).toLocaleString("en-IN")}` };
        const budget = overBudget(amount, 0);
        if (budget) return budget;
        await beat("OUTBID");
        await tx.insert(adBids).values({ slotId: slot.id, campaignId: campaign.id, sellerId: input.sellerId, day, amountPaise: amount, kind: "BID", status: "ACTIVE" });
        return { ok: true as const, status: "ACTIVE" as const, amountPaise: amount, events: dayEvents };
      });
      if (result.ok) { results.push({ day, ok: true, status: result.status, amountPaise: result.amountPaise }); events.push(...result.events); available -= extra; }
      else fail(result.reason);
    } catch {
      fail("Someone else just took this day; refresh and try again");
    }
  }
  return { results, events };
}

/**
 * After an ad day ends, charges the winner (taken from their next payout).
 * Only days whose ad was approved, and so could show, are charged.
 */
export async function chargeFinishedAdDays(db: Database, now = new Date()): Promise<AdEvent[]> {
  const today = istDayKey(now);
  const finished = await db.select({ bid: adBids, slotName: adSlots.name }).from(adBids)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adBids.campaignId)).innerJoin(adSlots, eq(adSlots.id, adBids.slotId))
    .where(and(eq(adBids.status, "WON"), sql`${adBids.day} < ${today}`, eq(adCampaigns.status, "APPROVED"),
      sql`not exists (select 1 from seller_charges c where c.kind = 'AD' and c.reference_id = ${adBids.id})`));
  const events: AdEvent[] = [];
  for (const { bid, slotName } of finished) {
    const charge = adChargeFor(bid.amountPaise);
    const inserted = await db.insert(sellerCharges).values({
      sellerId: bid.sellerId, kind: "AD", referenceId: bid.id, basePaise: charge.basePaise, gstPaise: charge.gstPaise, amountPaise: charge.totalPaise,
      description: `Ad: ${slotName} on ${bid.day} (${bid.impressions.toLocaleString("en-IN")} views, ${bid.clicks.toLocaleString("en-IN")} clicks) · ₹${(charge.basePaise / 100).toLocaleString("en-IN")} + ₹${(charge.gstPaise / 100).toLocaleString("en-IN")} GST`,
    }).onConflictDoNothing().returning({ id: sellerCharges.id });
    if (inserted.length) events.push({ kind: "CHARGED", sellerId: bid.sellerId, slotName, day: bid.day, amountPaise: charge.totalPaise, bidId: bid.id });
  }
  return events;
}

/** Ads to show today in a placement: approved, won, active slots. */
export async function liveAds(db: Database, placement: string, now = new Date()) {
  return db.select({ bidId: adBids.id, slotId: adSlots.id, slotName: adSlots.name, categoryId: adSlots.categoryId, campaignId: adCampaigns.id, productId: adCampaigns.productId, headline: adCampaigns.headline, desktopImageAssetId: adCampaigns.desktopImageAssetId, mobileImageAssetId: adCampaigns.mobileImageAssetId })
    .from(adBids).innerJoin(adSlots, eq(adSlots.id, adBids.slotId)).innerJoin(adCampaigns, eq(adCampaigns.id, adBids.campaignId))
    .where(and(eq(adSlots.placement, placement), eq(adSlots.isActive, true), eq(adBids.status, "WON"), eq(adBids.day, istDayKey(now)), eq(adCampaigns.status, "APPROVED")))
    .orderBy(adSlots.createdAt);
}
