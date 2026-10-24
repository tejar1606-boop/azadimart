ALTER TYPE "public"."coupon_funding_type" ADD VALUE 'SELLERS';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "coupon_max_discount_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "seller_discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "seller_discount_paise" integer DEFAULT 0 NOT NULL;