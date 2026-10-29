ALTER TABLE "product_price_history" ADD COLUMN "kind" text DEFAULT 'PRICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD COLUMN "coupon_pct_before" integer;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD COLUMN "coupon_pct_after" integer;--> statement-breakpoint
CREATE INDEX "product_price_history_created_idx" ON "product_price_history" USING btree ("created_at");