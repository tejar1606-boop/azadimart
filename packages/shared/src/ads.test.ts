import { describe, expect, it } from "vitest";
import { adBidSchema, adChargeFor, adSlotSchema, addDays, biddingClosesAt, istDayKey, istDayStart, minimumNextBid } from "./ads";

describe("ad calendar (India time)", () => {
  it("uses the IST calendar day", () => {
    expect(istDayKey(new Date("2026-10-13T18:29:59Z"))).toBe("2026-10-13"); // 23:59:59 IST
    expect(istDayKey(new Date("2026-10-13T18:30:00Z"))).toBe("2026-10-14"); // 00:00 IST
    expect(istDayStart("2026-10-14").toISOString()).toBe("2026-10-13T18:30:00.000Z");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("bidding closes hours before the day starts", () => {
    expect(biddingClosesAt("2026-10-14", 12).toISOString()).toBe("2026-10-13T06:30:00.000Z"); // 12:00 IST the day before
  });
  it("next bid must beat the top bid by the step, or meet the starting price", () => {
    const slot = { basePricePaise: 50_000, bidIncrementPaise: 10_000 };
    expect(minimumNextBid(slot, null)).toBe(50_000);
    expect(minimumNextBid(slot, 70_000)).toBe(80_000);
  });
});

describe("ad inputs", () => {
  const slot = { name: "Home banner 1", placement: "HOME_HERO", basePricePaise: 50_000, bidIncrementPaise: 10_000, closeHoursBefore: 12 };
  it("book-now price can't be below the starting price", () => {
    expect(adSlotSchema.safeParse({ ...slot, buyNowPricePaise: 40_000 }).success).toBe(false);
    expect(adSlotSchema.safeParse({ ...slot, buyNowPricePaise: 200_000 }).success).toBe(true);
  });
  it("bids need an amount and distinct days", () => {
    const id = "6f1c8f2e-3b8a-4c5d-9e7f-1a2b3c4d5e6f";
    expect(adBidSchema.safeParse({ campaignId: id, days: ["2026-10-14"], mode: "BID" }).success).toBe(false);
    expect(adBidSchema.safeParse({ campaignId: id, days: ["2026-10-14", "2026-10-14"], mode: "BID", amountPaise: 60_000 }).success).toBe(false);
    expect(adBidSchema.safeParse({ campaignId: id, days: ["2026-10-14", "2026-10-15", "2026-10-16"], mode: "BUY_NOW" }).success).toBe(true);
  });
});

describe("ad placements and charges", () => {
  const base = { name: "Category top", basePricePaise: 20_000, bidIncrementPaise: 5_000, closeHoursBefore: 12 };
  it("category placements need a category; others mustn't have one", () => {
    const cat = "6f1c8f2e-3b8a-4c5d-9e7f-1a2b3c4d5e6f";
    expect(adSlotSchema.safeParse({ ...base, placement: "CATEGORY_TOP" }).success).toBe(false);
    expect(adSlotSchema.safeParse({ ...base, placement: "CATEGORY_TOP", categoryId: cat }).success).toBe(true);
    expect(adSlotSchema.safeParse({ ...base, placement: "SEARCH_TOP", categoryId: cat }).success).toBe(false);
  });
  it("adds 18% GST to the ad fee", () => {
    expect(adChargeFor(50_000)).toEqual({ basePaise: 50_000, gstPaise: 9_000, totalPaise: 59_000 });
  });
});
