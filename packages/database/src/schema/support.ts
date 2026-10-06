import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { ticketStatusEnum } from "./enums";
import { customers } from "./identity";
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
