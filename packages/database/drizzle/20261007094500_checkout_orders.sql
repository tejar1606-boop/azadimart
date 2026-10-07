ALTER TABLE "orders"
  ADD COLUMN "subtotal_paise" integer NOT NULL DEFAULT 0,
  ADD COLUMN "discount_paise" integer NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_paise" integer NOT NULL DEFAULT 0,
  ADD COLUMN "coupon_code" text,
  ADD COLUMN "shipping_address_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;
