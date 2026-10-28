import type { LiveChatAttachment } from "@azadimart/shared";
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";
import { customers, users } from "./identity";
import { sellers } from "./sellers";
import { supportChats, supportTickets } from "./support";

/** A real-time chat between a shopper/seller (or guest) and a support agent. */
export const liveChats = pgTable(
  "live_chats",
  {
    id,
    source: text("source").$type<"STOREFRONT" | "SELLER">().notNull(),
    requesterType: text("requester_type").$type<"CUSTOMER" | "SELLER" | "GUEST">().notNull(),
    userId: uuid("user_id").references(() => users.id),
    customerId: uuid("customer_id").references(() => customers.id),
    sellerId: uuid("seller_id").references(() => sellers.id),
    guestName: text("guest_name"),
    guestContact: text("guest_contact"),
    /** SHA-256 of the guest's chat key (guests have no account). */
    guestTokenHash: text("guest_token_hash"),
    topic: text("topic").notNull().default("OTHER"),
    page: text("page"),
    status: text("status").$type<"WAITING" | "ACTIVE" | "ENDED">().notNull().default("WAITING"),
    assignedAgentId: uuid("assigned_agent_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** When it last (re)joined the queue; queue order and wait times use this. */
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    firstAgentReplyAt: timestamp("first_agent_reply_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: text("ended_by").$type<"REQUESTER" | "AGENT" | "SYSTEM">(),
    endReason: text("end_reason").$type<"RESOLVED" | "ABANDONED" | "IDLE" | "TICKET">(),
    requesterSeenAt: timestamp("requester_seen_at", { withTimezone: true }).notNull().defaultNow(),
    requesterTypingAt: timestamp("requester_typing_at", { withTimezone: true }),
    agentTypingAt: timestamp("agent_typing_at", { withTimezone: true }),
    /** Last message seq each side has read (read receipts and unread counts). */
    requesterReadSeq: bigint("requester_read_seq", { mode: "number" }).notNull().default(0),
    agentReadSeq: bigint("agent_read_seq", { mode: "number" }).notNull().default(0),
    rating: integer("rating"),
    ratingNote: text("rating_note"),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    /** The assistant conversation that led here (the agent sees it, so nobody repeats themselves). */
    assistantChatId: uuid("assistant_chat_id").references(() => supportChats.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("live_chats_status_idx").on(table.status, table.queuedAt),
    index("live_chats_agent_idx").on(table.assignedAgentId, table.status),
    index("live_chats_user_idx").on(table.userId, table.status),
  ],
);

export const liveChatMessages = pgTable(
  "live_chat_messages",
  {
    /** Increasing number: clients ask for "everything after seq N". */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    chatId: uuid("chat_id").notNull().references(() => liveChats.id, { onDelete: "cascade" }),
    author: text("author").$type<"REQUESTER" | "AGENT" | "SYSTEM">().notNull(),
    agentUserId: uuid("agent_user_id").references(() => users.id),
    body: text("body").notNull(),
    /** A photo or PDF sent with the message (body is then an optional caption). */
    attachment: jsonb("attachment").$type<LiveChatAttachment>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("live_chat_messages_chat_idx").on(table.chatId, table.seq)],
);

/** Each agent's availability in the live chat console. */
export const liveChatAgents = pgTable("live_chat_agents", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"ONLINE" | "AWAY" | "OFFLINE">().notNull().default("OFFLINE"),
  maxChats: integer("max_chats").notNull().default(3),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});
