import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { customers, users } from "./identity";
import { sellers } from "./sellers";
import { orders } from "./commerce";
import { supportTickets } from "./support";

/**
 * Call-centre agents (support team members): whether they take calls now.
 * AVAILABLE agents get incoming calls (longest-idle first); BUSY = on a call.
 */
export const callAgents = pgTable("call_agents", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"AVAILABLE" | "AWAY" | "OFFLINE">().notNull().default("OFFLINE"),
  /** The agent's softphone identity at the telephony provider (e.g. Exotel SIP user). */
  providerAgentId: text("provider_agent_id"),
  /** Heartbeat from the open Call Centre screen; agents unseen for a while are treated as offline. */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** When their last call ended (fair routing: longest idle answers first). */
  lastCallEndedAt: timestamp("last_call_ended_at", { withTimezone: true }),
  ...timestamps,
});

export type CallStatus = "RINGING" | "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "NO_ANSWER" | "FAILED";
export type CallEvent = { at: string; type: string; byUserId?: string | null; note?: string };

/** Every customer-service call, incoming and outgoing, with who handled it and what happened. */
export const calls = pgTable(
  "calls",
  {
    id,
    direction: text("direction").$type<"INBOUND" | "OUTBOUND">().notNull(),
    status: text("status").$type<CallStatus>().notNull(),
    provider: text("provider").notNull(),
    providerCallId: text("provider_call_id"),
    /** The other side's number (10 digits for Indian mobiles) and LOIMART's number used. */
    customerPhone: text("customer_phone").notNull(),
    businessNumber: text("business_number"),
    /** IVR choice for incoming calls: ORDERS / SELLERS / OTHER. */
    ivrChoice: text("ivr_choice"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    agentUserId: uuid("agent_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Agents who let it ring out or declined (not offered again). */
    skippedAgentIds: uuid("skipped_agent_ids").array().notNull().default([]),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    waitSeconds: integer("wait_seconds"),
    durationSeconds: integer("duration_seconds"),
    recordingUrl: text("recording_url"),
    outcome: text("outcome").$type<"RESOLVED" | "FOLLOW_UP" | "ESCALATED" | "WRONG_NUMBER" | "NO_RESPONSE">(),
    notes: text("notes"),
    /** Missed incoming calls: when someone called back (or dismissed it). */
    callbackDoneAt: timestamp("callback_done_at", { withTimezone: true }),
    callbackByUserId: uuid("callback_by_user_id").references(() => users.id, { onDelete: "set null" }),
    events: jsonb("events").$type<CallEvent[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("calls_provider_call_unique").on(table.provider, table.providerCallId),
    index("calls_status_idx").on(table.status),
    index("calls_agent_idx").on(table.agentUserId),
    index("calls_phone_idx").on(table.customerPhone),
    index("calls_created_idx").on(table.createdAt),
  ],
);
