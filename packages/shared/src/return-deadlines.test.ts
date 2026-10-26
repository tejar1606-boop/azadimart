import { describe, expect, it } from "vitest";
import { returnDeadline } from "./return-deadlines";

describe("return deadlines", () => {
  const since = new Date("2026-10-20T10:00:00Z");
  it("seller has 48 hours to reply", () => {
    expect(returnDeadline("REQUESTED", since, new Date("2026-10-22T09:59:00Z"))).toMatchObject({ who: "SELLER", overdue: false });
    expect(returnDeadline("REQUESTED", since, new Date("2026-10-22T10:01:00Z"))?.overdue).toBe(true);
  });
  it("2 days to book pickup, 7 to receive, LOIMART 2 to refund", () => {
    expect(returnDeadline("APPROVED", since)?.dueAt.toISOString()).toBe("2026-10-22T10:00:00.000Z");
    expect(returnDeadline("PICKUP_SCHEDULED", since)?.dueAt.toISOString()).toBe("2026-10-27T10:00:00.000Z");
    expect(returnDeadline("RECEIVED", since)).toMatchObject({ who: "LOIMART", dueAt: new Date("2026-10-22T10:00:00Z") });
  });
  it("nothing waiting once refunded or rejected", () => {
    expect(returnDeadline("REFUNDED", since)).toBeNull();
    expect(returnDeadline("REJECTED", since)).toBeNull();
  });
});
