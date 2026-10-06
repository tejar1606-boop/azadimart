import { describe, expect, it } from "vitest";
import { applySectionReorder } from "./theme";

describe("theme editor commands", () => {
  it("reorders sections without dropping unknown ids", () => {
    const sections = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(applySectionReorder(sections, ["c", "a", "b"]).map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});
