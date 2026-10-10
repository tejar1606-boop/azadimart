import { z } from "zod";

/**
 * Help & support: customers and sellers chat with the AzadiMart assistant,
 * and can hand the conversation to a person, which opens a ticket. The
 * support team works tickets in the admin portal.
 */
export type SupportRequester = "CUSTOMER" | "SELLER";

export const SUPPORT_CATEGORIES = {
  ORDER: { label: "Order & delivery", for: "CUSTOMER" },
  CANCELLATION: { label: "Cancel an order", for: "CUSTOMER" },
  RETURN: { label: "Returns & refunds", for: "CUSTOMER" },
  PAYMENT: { label: "Payments", for: "CUSTOMER" },
  PRODUCT: { label: "Product question", for: "CUSTOMER" },
  ACCOUNT: { label: "Account & sign-in", for: "CUSTOMER" },
  SELLER_ORDERS: { label: "Orders & shipping", for: "SELLER" },
  SELLER_PAYMENTS: { label: "Payments & payouts", for: "SELLER" },
  SELLER_PRODUCTS: { label: "Products & quality check", for: "SELLER" },
  SELLER_KYC: { label: "KYC & documents", for: "SELLER" },
  SELLER_ADS: { label: "Ads", for: "SELLER" },
  SELLER_ACCOUNT: { label: "Account & settings", for: "SELLER" },
  OTHER: { label: "Something else", for: "ANY" },
} as const satisfies Record<string, { label: string; for: SupportRequester | "ANY" }>;
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;
export const SUPPORT_CATEGORY_KEYS = Object.keys(SUPPORT_CATEGORIES) as SupportCategory[];
export const supportCategoriesFor = (requester: SupportRequester) =>
  SUPPORT_CATEGORY_KEYS.filter((key) => SUPPORT_CATEGORIES[key].for === requester || SUPPORT_CATEGORIES[key].for === "ANY");
export const supportCategoryLabel = (key: string) => (SUPPORT_CATEGORIES as Record<string, { label: string }>)[key]?.label ?? "Something else";

export const SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
/** Words the requester sees; WAITING means "waiting for your reply". */
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting for your reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
export const SUPPORT_STATUS_STAFF_LABELS: Record<SupportStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting on requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const SUPPORT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
/** First-reply target per priority, in hours. */
export const SUPPORT_FIRST_REPLY_HOURS: Record<SupportPriority, number> = { LOW: 48, NORMAL: 24, HIGH: 8, URGENT: 4 };
/** Starting priority: money and KYC problems block sellers, so they start higher. */
export function defaultSupportPriority(category: string): SupportPriority {
  return category === "PAYMENT" || category === "SELLER_PAYMENTS" || category === "SELLER_KYC" ? "HIGH" : "NORMAL";
}
/** A ticket waiting on the team is overdue once the reply target has passed since the requester last wrote. */
export function isSupportOverdue(ticket: { status: string; priority: string; lastReplyBy: string | null; lastMessageAt: Date | string }, now = Date.now()): boolean {
  if (!["OPEN", "IN_PROGRESS"].includes(ticket.status) || ticket.lastReplyBy === "STAFF") return false;
  const hours = SUPPORT_FIRST_REPLY_HOURS[ticket.priority as SupportPriority] ?? 24;
  return now - new Date(ticket.lastMessageAt).getTime() > hours * 60 * 60 * 1000;
}
/** "#1042" */
export const supportTicketRef = (number: number) => `#${number}`;

const text = (max: number) => z.string().trim().min(1, "Write a message").max(max);

/** A chat turn from the widget. `intent` is set when a quick-reply button was tapped. */
export const supportChatSchema = z.object({
  chatId: z.string().uuid().nullable().optional().default(null),
  message: z.string().trim().max(1000).optional().default(""),
  intent: z.string().trim().max(40).optional().default(""),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(30).optional().default([]),
  page: z.string().trim().max(300).optional().default(""),
}).refine((v) => v.message || v.intent, { message: "Write a message", path: ["message"] });
export type SupportChatInput = z.infer<typeof supportChatSchema>;

export const supportTicketCreateSchema = z.object({
  category: z.enum(SUPPORT_CATEGORY_KEYS as [SupportCategory, ...SupportCategory[]]),
  subject: z.string().trim().min(3, "Add a short subject").max(120),
  message: text(4000),
  orderId: z.string().uuid().nullable().optional().default(null),
  productId: z.string().uuid().nullable().optional().default(null),
  chatId: z.string().uuid().nullable().optional().default(null),
});
export type SupportTicketCreateInput = z.infer<typeof supportTicketCreateSchema>;

export const supportReplySchema = z.object({ message: text(4000), internal: z.boolean().optional().default(false) });
export const supportRequesterUpdateSchema = z.object({ status: z.enum(["RESOLVED"]).optional(), rating: z.number().int().min(1).max(5).optional(), ratingNote: z.string().trim().max(500).optional() })
  .refine((v) => v.status || v.rating, { message: "Nothing to update" });

export const supportStaffUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  category: z.enum(SUPPORT_CATEGORY_KEYS as [SupportCategory, ...SupportCategory[]]).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export const supportCannedReplySchema = z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(4000) });
