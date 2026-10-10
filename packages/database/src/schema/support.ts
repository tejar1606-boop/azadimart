import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { ticketStatusEnum } from "./enums";
import { customers, users } from "./identity";
import { orders } from "./commerce";
import { sellers } from "./sellers";

export const supportTickets = pgTable(
  "support_tickets",
  {
    id,
    customerId: uuid("customer_id").references(() => customers.id),
    sellerId: uuid("seller_id").references(() => sellers.id),
    orderId: uuid("order_id").references(() => orders.id),
    subject: text("subject").notNull(),
    status: ticketStatusEnum("status").notNull().default("OPEN"),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => [
    index("support_tickets_customer_id_idx").on(table.customerId),
    index("support_tickets_seller_id_idx").on(table.sellerId),
  ],
);


export const supportMessages = pgTable(
  "support_messages",
  {
    id,
    ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id").notNull().references(() => users.id),
    message: text("message").notNull(),
    attachmentMetadata: jsonb("attachment_metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("support_messages_ticket_id_idx").on(table.ticketId)],
);
