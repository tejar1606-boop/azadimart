ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_weight_grams_nonnegative
  CHECK (weight_grams >= 0);
