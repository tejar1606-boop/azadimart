CREATE TYPE "public"."wallet_topup_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."wallet_txn_type" AS ENUM('TOP_UP', 'COURIER_CHARGE', 'COURIER_REFUND', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "seller_wallet_top_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"reference" text NOT NULL,
	"status" "wallet_topup_status" DEFAULT 'PENDING' NOT NULL,
	"admin_note" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_wallet_top_ups_amount_positive" CHECK ("seller_wallet_top_ups"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "seller_wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"type" "wallet_txn_type" NOT NULL,
	"amount_paise" integer NOT NULL,
	"balance_after_paise" integer NOT NULL,
	"shipment_id" uuid,
	"top_up_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "wallet_balance_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "wallet_paid_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_wallet_top_ups" ADD CONSTRAINT "seller_wallet_top_ups_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_wallet_top_ups" ADD CONSTRAINT "seller_wallet_top_ups_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_wallet_transactions" ADD CONSTRAINT "seller_wallet_transactions_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_wallet_transactions" ADD CONSTRAINT "seller_wallet_transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_wallet_top_ups_reference_unique" ON "seller_wallet_top_ups" USING btree (upper("reference")) WHERE "seller_wallet_top_ups"."status" <> 'REJECTED';--> statement-breakpoint
CREATE INDEX "seller_wallet_top_ups_status_idx" ON "seller_wallet_top_ups" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "seller_wallet_transactions_seller_idx" ON "seller_wallet_transactions" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "seller_wallet_transactions_shipment_idx" ON "seller_wallet_transactions" USING btree ("shipment_id");--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_wallet_balance_non_negative" CHECK ("sellers"."wallet_balance_paise" >= 0);