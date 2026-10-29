CREATE TABLE "fee_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"financial_year" text NOT NULL,
	"sequence" integer NOT NULL,
	"seller_id" uuid NOT NULL,
	"payout_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taxable_paise" integer NOT NULL,
	"cgst_paise" integer DEFAULT 0 NOT NULL,
	"sgst_paise" integer DEFAULT 0 NOT NULL,
	"igst_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "fee_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_invoices_number_unique" ON "fee_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_invoices_payout_unique" ON "fee_invoices" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "fee_invoices_seller_id_idx" ON "fee_invoices" USING btree ("seller_id");