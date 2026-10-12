import { describe, expect, it } from "vitest";
import { estimateLiveWait, liveChatStartSchema, liveChatWaitText } from "./live-chat";
import { STAFF_PERMISSION_KEYS, adminPagePermission } from "./staff";

describe("live chat", () => {
  it("estimates the wait from the queue and free agents", () => {
    expect(estimateLiveWait(1, 2, 1)).toBe(15);
    expect(estimateLiveWait(2, 2, 2)).toBe(15);
    expect(estimateLiveWait(3, 1, 2)).toBe(240);
    expect(estimateLiveWait(1, 0, 0)).toBeNull();
  });

  it("says the wait in plain words", () => {
    expect(liveChatWaitText(null)).toMatch(/offline/);
    expect(liveChatWaitText(20)).toBe("Usually under a minute");
    expect(liveChatWaitText(180)).toBe("About 3 minutes");
    expect(liveChatWaitText(60)).toBe("About 1 minute");
  });

  it("needs a message to start", () => {
    expect(liveChatStartSchema.safeParse({ message: "" }).success).toBe(false);
    expect(liveChatStartSchema.safeParse({ message: "Where is my order?" }).data?.topic).toBe("OTHER");
  });

  it("is its own area for team roles", () => {
    expect(STAFF_PERMISSION_KEYS).toContain("livechat");
    expect(adminPagePermission("/live-chat")).toBe("livechat");
  });
});
