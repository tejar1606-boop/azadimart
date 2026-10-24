import { describe, expect, it } from "vitest";
import { canAccessAudience } from "./roles";
import { defaultSupportPriority, isSupportOverdue, supportCategoriesFor, supportChatSchema, supportTicketCreateSchema } from "./support";

describe("support", () => {
  it("splits topics between customers and sellers", () => {
    const customer = supportCategoriesFor("CUSTOMER");
    const seller = supportCategoriesFor("SELLER");
    expect(customer).toContain("RETURN");
    expect(customer).not.toContain("SELLER_KYC");
    expect(seller).toContain("SELLER_KYC");
    expect(seller).not.toContain("RETURN");
    expect(customer).toContain("OTHER");
    expect(seller).toContain("OTHER");
  });

  it("starts money and KYC problems at High priority", () => {
    expect(defaultSupportPriority("PAYMENT")).toBe("HIGH");
    expect(defaultSupportPriority("SELLER_PAYMENTS")).toBe("HIGH");
    expect(defaultSupportPriority("SELLER_KYC")).toBe("HIGH");
    expect(defaultSupportPriority("ORDER")).toBe("NORMAL");
  });

  it("is overdue only while waiting on the team past the reply target", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    const ago = (h: number) => new Date(now - h * 3600_000);
    expect(isSupportOverdue({ status: "OPEN", priority: "NORMAL", lastReplyBy: "REQUESTER", lastMessageAt: ago(25) }, now)).toBe(true);
    expect(isSupportOverdue({ status: "OPEN", priority: "NORMAL", lastReplyBy: "REQUESTER", lastMessageAt: ago(23) }, now)).toBe(false);
    expect(isSupportOverdue({ status: "OPEN", priority: "URGENT", lastReplyBy: "REQUESTER", lastMessageAt: ago(5) }, now)).toBe(true);
    expect(isSupportOverdue({ status: "WAITING", priority: "URGENT", lastReplyBy: "STAFF", lastMessageAt: ago(50) }, now)).toBe(false);
    expect(isSupportOverdue({ status: "RESOLVED", priority: "HIGH", lastReplyBy: "REQUESTER", lastMessageAt: ago(50) }, now)).toBe(false);
  });

  it("validates chat turns and tickets", () => {
    expect(supportChatSchema.safeParse({}).success).toBe(false);
    expect(supportChatSchema.safeParse({ intent: "menu" }).success).toBe(true);
    expect(supportTicketCreateSchema.safeParse({ category: "ORDER", subject: "Hi", message: "x" }).success).toBe(false);
    expect(supportTicketCreateSchema.safeParse({ category: "NOPE", subject: "Late order", message: "x" }).success).toBe(false);
    expect(supportTicketCreateSchema.safeParse({ category: "ORDER", subject: "Late order", message: "Where is it" }).success).toBe(true);
  });

  it("support agents belong to the admin portal only", () => {
    expect(canAccessAudience("SUPPORT", "admin")).toBe(true);
    expect(canAccessAudience("SUPPORT", "seller")).toBe(false);
    expect(canAccessAudience("SUPPORT", "storefront")).toBe(false);
  });
});
