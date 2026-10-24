CREATE TABLE "invoice_counters" (
	"seller_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"financial_year" text NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_seller_id_kind_financial_year_pk" PRIMARY KEY("seller_id","kind","financial_year")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"financial_year" text NOT NULL,
	"sequence" integer NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"original_invoice_id" uuid,
	"source_key" text NOT NULL,
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
ALTER TABLE "categories" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "gst_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "gst_price_limit_paise" integer;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "gst_rate_above_limit_bps" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "gst_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "gst_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_seller_number_unique" ON "invoices" USING btree ("seller_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_source_key_unique" ON "invoices" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "invoices_order_id_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_issued_at_idx" ON "invoices" USING btree ("issued_at");