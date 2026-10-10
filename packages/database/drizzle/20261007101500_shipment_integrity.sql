CREATE UNIQUE INDEX IF NOT EXISTS shipments_order_seller_unique
  ON shipments (order_id, seller_id);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS shipment_events_status_created_at_idx
  ON shipment_events (shipment_id, created_at);
