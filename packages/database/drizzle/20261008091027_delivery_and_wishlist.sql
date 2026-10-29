ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: already-delivered orders start their return window at the last update.
UPDATE "orders" SET "delivered_at" = "updated_at" WHERE "status" = 'DELIVERED' AND "delivered_at" IS NULL;--> statement-breakpoint
-- Merge duplicate wishlists into each customer's oldest one before enforcing uniqueness.
INSERT INTO "wishlist_items" ("wishlist_id", "product_id", "created_at", "updated_at")
SELECT keep.id, wi."product_id", wi."created_at", wi."updated_at"
FROM "wishlist_items" wi
JOIN "wishlists" w ON w.id = wi."wishlist_id"
JOIN LATERAL (
  SELECT k.id FROM "wishlists" k WHERE k."customer_id" = w."customer_id" ORDER BY k."created_at", k.id LIMIT 1
) keep ON keep.id <> w.id
ON CONFLICT ("wishlist_id", "product_id") DO NOTHING;--> statement-breakpoint
DELETE FROM "wishlists" w
WHERE w.id <> (
  SELECT k.id FROM "wishlists" k WHERE k."customer_id" = w."customer_id" ORDER BY k."created_at", k.id LIMIT 1
);--> statement-breakpoint
DROP INDEX "wishlists_customer_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_customer_id_unique" ON "wishlists" USING btree ("customer_id");
