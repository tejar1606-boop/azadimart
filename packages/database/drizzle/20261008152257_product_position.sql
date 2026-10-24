ALTER TABLE "products" ADD COLUMN "position" integer;--> statement-breakpoint
CREATE INDEX "products_position_idx" ON "products" USING btree ("position");