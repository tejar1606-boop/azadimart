import { describe, expect, it } from "vitest";
import { INDIA_STATES, matchIndiaState } from "./india-states";

describe("matchIndiaState", () => {
  it("keeps names already in the list", () => { for (const s of INDIA_STATES) expect(matchIndiaState(s)).toBe(s); });
  it("maps other spellings", () => {
    expect(matchIndiaState("NCT of Delhi")).toBe("Delhi");
    expect(matchIndiaState("National Capital Territory of Delhi")).toBe("Delhi");
    expect(matchIndiaState("ORISSA")).toBe("Odisha");
    expect(matchIndiaState("Jammu & Kashmir")).toBe("Jammu and Kashmir");
    expect(matchIndiaState("Pondicherry")).toBe("Puducherry");
  });
  it("returns empty for unknown", () => { expect(matchIndiaState("Atlantis")).toBe(""); expect(matchIndiaState(null)).toBe(""); });
});
