CREATE TABLE "order_cashbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"wallet_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "cashback_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cashback_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payout_items" ADD COLUMN "cashback_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_cashbacks" ADD CONSTRAINT "order_cashbacks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cashbacks" ADD CONSTRAINT "order_cashbacks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cashbacks" ADD CONSTRAINT "order_cashbacks_wallet_entry_id_customer_wallet_entries_id_fk" FOREIGN KEY ("wallet_entry_id") REFERENCES "public"."customer_wallet_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_cashbacks_order_unique" ON "order_cashbacks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_cashbacks_customer_idx" ON "order_cashbacks" USING btree ("customer_id","created_at");