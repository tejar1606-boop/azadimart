DROP INDEX "customer_wallet_spend_order_unique";--> statement-breakpoint
ALTER TABLE "customer_wallet_entries" ADD COLUMN "full_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallet_spend_order_unique" ON "customer_wallet_entries" USING btree ("order_id","kind") WHERE "customer_wallet_entries"."kind" in ('ORDER_SPEND', 'ORDER_REFUND', 'CANCEL_REFUND');