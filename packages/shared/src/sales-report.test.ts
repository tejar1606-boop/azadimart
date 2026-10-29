import { describe, expect, it } from "vitest";
import { canonicalState, istDay, istDayStartAgo, istDays } from "./sales-report";

describe("sales report", () => {
  it("matches what shoppers type to the official state name", () => {
    expect(canonicalState(" tamil  nadu ")).toBe("Tamil Nadu");
    expect(canonicalState("Orissa")).toBe("Odisha");
    expect(canonicalState("New Delhi")).toBe("Delhi");
    expect(canonicalState("Jammu & Kashmir")).toBe("Jammu and Kashmir");
    expect(canonicalState("AP")).toBe("Andhra Pradesh");
    expect(canonicalState("Hyderabad")).toBeNull();
    expect(canonicalState("")).toBeNull();
  });
  it("counts days in India time", () => {
    const now = new Date("2026-10-25T19:00:00Z"); // 26 Oct 00:30 IST
    expect(istDay(now)).toBe("2026-10-26");
    expect(istDayStartAgo(now, 0).toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(istDayStartAgo(now, 1).toISOString()).toBe("2026-10-24T18:30:00.000Z");
    expect(istDays(now, 3)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });
});
