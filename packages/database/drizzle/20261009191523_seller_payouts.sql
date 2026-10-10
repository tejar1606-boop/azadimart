DROP INDEX "payout_items_order_item_id_idx";--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD COLUMN "verification_status" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD COLUMN "verified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "payout_hold_reason" text;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "commission_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "commission_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "gst_on_commission_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "tcs_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "tds_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "gross_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "deductions_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "item_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "mode" text DEFAULT 'TEST' NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "utr" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "provider_ref" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "initiated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD CONSTRAINT "seller_bank_accounts_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_bank_account_id_seller_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."seller_bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_items_order_item_id_unique" ON "payout_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_reference_unique" ON "payouts" USING btree ("reference");--> statement-breakpoint
-- Cash on Delivery is collected by the courier at delivery, so delivered COD orders count as paid
UPDATE "payments" SET "status" = 'CAPTURED', "updated_at" = now() FROM "orders" WHERE "orders"."id" = "payments"."order_id" AND "payments"."provider" = 'COD' AND "payments"."status" = 'PENDING' AND "orders"."status" = 'DELIVERED';