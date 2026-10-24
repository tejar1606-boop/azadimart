import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_PREFERENCES, notifySeller, orderLinesSummary, wantsPush } from "./index";

describe("seller alerts", () => {
  it("push follows the seller's choices per kind", () => {
    const prefs = { ...DEFAULT_ALERT_PREFERENCES, newOrders: false };
    expect(wantsPush(prefs, "NEW_ORDER")).toBe(false);
    expect(wantsPush(prefs, "SHIP_BY_REMINDER")).toBe(true);
    expect(wantsPush({ ...DEFAULT_ALERT_PREFERENCES, reminders: false }, "ORDER_LATE")).toBe(false);
    expect(wantsPush({ ...DEFAULT_ALERT_PREFERENCES, cancellations: false }, "ORDER_AUTO_CANCELLED")).toBe(false);
  });
  it("summarises order lines", () => {
    expect(orderLinesSummary([{ title: "Kitchen Set", quantity: 2 }])).toBe("Kitchen Set × 2");
    expect(orderLinesSummary([{ title: "Kitchen Set", quantity: 1 }, { title: "Shampoo", quantity: 1 }, { title: "Bat", quantity: 3 }])).toBe("Kitchen Set × 1 and 2 more");
  });
  it("never throws, so alerts can't break checkout or cancellation", async () => {
    const broken = { insert: () => { throw new Error("database down"); } } as unknown as Parameters<typeof notifySeller>[0];
    await expect(notifySeller(broken, { sellerId: "s", kind: "NEW_ORDER", title: "New order" })).resolves.toBe(false);
  });
});
