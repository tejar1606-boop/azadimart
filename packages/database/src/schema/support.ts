import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { ticketStatusEnum } from "./enums";
import { customers, users } from "./identity";
import { orders } from "./commerce";
import { products } from "./catalog";
import { sellers } from "./sellers";

/**
 * A request for help from a customer or a seller. Opened from the help chat
 * ("Talk to a person") or the support form; worked by the support team.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id,
    /** Short public reference, shown as #1001. */
    number: integer("number").generatedByDefaultAsIdentity({ startWith: 1001 }).notNull(),
    requesterType: text("requester_type").$type<"CUSTOMER" | "SELLER">().notNull().default("CUSTOMER"),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    customerId: uuid("customer_id").references(() => customers.id),
    sellerId: uuid("seller_id").references(() => sellers.id),
    orderId: uuid("order_id").references(() => orders.id),
    productId: uuid("product_id").references(() => products.id),
    category: text("category").notNull().default("OTHER"),
    priority: text("priority").$type<"LOW" | "NORMAL" | "HIGH" | "URGENT">().notNull().default("NORMAL"),
    channel: text("channel").$type<"CHAT" | "FORM">().notNull().default("FORM"),
    subject: text("subject").notNull(),
    status: ticketStatusEnum("status").notNull().default("OPEN"),
    /** The first message, kept for list previews. */
    body: text("body").notNull(),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastReplyBy: text("last_reply_by").$type<"REQUESTER" | "STAFF">().notNull().default("REQUESTER"),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    requesterUnread: boolean("requester_unread").notNull().default(false),
    staffUnread: boolean("staff_unread").notNull().default(true),
    rating: integer("rating"),
    ratingNote: text("rating_note"),
    ...timestamps,
  },
  (table) => [
    index("support_tickets_customer_id_idx").on(table.customerId),
    index("support_tickets_seller_id_idx").on(table.sellerId),
    index("support_tickets_status_idx").on(table.status, table.lastMessageAt),
    index("support_tickets_assignee_idx").on(table.assignedToUserId),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id,
    ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
    /** Empty for assistant and system messages. */
    senderUserId: uuid("sender_user_id").references(() => users.id),
    authorType: text("author_type").$type<"REQUESTER" | "STAFF" | "BOT" | "SYSTEM">().notNull().default("REQUESTER"),
    /** Staff-only note, never shown to the requester. */
    isInternal: boolean("is_internal").notNull().default(false),
    message: text("message").notNull(),
    attachmentMetadata: jsonb("attachment_metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("support_messages_ticket_id_idx").on(table.ticketId)],
);

/** A help-chat conversation with the assistant (kept to measure how many it solves, and attached to tickets). */
export const supportChats = pgTable(
  "support_chats",
  {
    id,
    requesterType: text("requester_type").$type<"CUSTOMER" | "SELLER">().notNull(),
    userId: uuid("user_id").references(() => users.id),
    customerId: uuid("customer_id").references(() => customers.id),
    sellerId: uuid("seller_id").references(() => sellers.id),
    messages: jsonb("messages").$type<Array<{ role: "user" | "assistant"; content: string; at: string }>>().notNull().default([]),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    engine: text("engine").$type<"GUIDED" | "AI">().notNull().default("GUIDED"),
    ...timestamps,
  },
  (table) => [index("support_chats_created_idx").on(table.createdAt)],
);

/** Saved replies the team can insert with one click. */
export const supportCannedReplies = pgTable("support_canned_replies", {
  id,
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  ...timestamps,
});
