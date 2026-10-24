CREATE TABLE "settlement_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"payout_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"quantity" integer NOT NULL,
	"sold_paise" integer NOT NULL,
	"commission_paise" integer DEFAULT 0 NOT NULL,
	"gst_on_commission_paise" integer DEFAULT 0 NOT NULL,
	"tcs_paise" integer DEFAULT 0 NOT NULL,
	"recovery_paise" integer NOT NULL,
	"fee_credit_note_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_invoices" ALTER COLUMN "payout_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN "kind" text DEFAULT 'INVOICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN "original_fee_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_adjustments_source_item_unique" ON "settlement_adjustments" USING btree ("source_key","order_item_id");--> statement-breakpoint
CREATE INDEX "settlement_adjustments_seller_idx" ON "settlement_adjustments" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_invoices_source_key_unique" ON "fee_invoices" USING btree ("source_key");