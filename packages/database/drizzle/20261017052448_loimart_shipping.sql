ALTER TABLE "payout_items" ADD COLUMN "shipping_fee_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "shipped_by" text DEFAULT 'SELLER' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "shipping_fee_paise" integer DEFAULT 0 NOT NULL;