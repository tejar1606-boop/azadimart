# AzadiMart — Database Design

## Principles
- PostgreSQL / Neon
- UUID primary keys
- timestamptz timestamps
- numeric monetary fields
- foreign keys and constraints
- versioned migrations
- transactions for critical workflows
- soft deletion where historical data matters

## Identity
`users`, `roles`, `user_roles`, `sessions`

## Customers
`customers`, `customer_addresses`, `wishlists`, `wishlist_items`

## Sellers
`sellers`, `seller_documents`, `seller_verifications`, `seller_bank_accounts`, `seller_settings`

Seller-owned records must be scoped by authenticated seller identity.

## Catalog
`categories`, `brands`, `products`, `product_variants`, `product_attributes`, `product_media`, `product_aplus_content`

Product lifecycle: draft → pending_qc → approved/rejected → published/unpublished/archived.

Product media rules:
- maximum 8 images
- maximum 1 standard product video
- one primary image

## Inventory
`inventory`, `inventory_movements`

Inventory changes must be transactional and must never result in negative stock.

## Commerce
`carts`, `cart_items`, `orders`, `order_items`

Orders snapshot product name, SKU, seller, price and addresses so historical orders remain stable.

## Payments
`payments`, `payment_events`, `refunds`

Webhook event IDs must be unique per provider. Financial operations require idempotency.

## Logistics
`delivery_providers`, `shipments`, `shipment_events`, `serviceability`

Provider-specific credentials remain server-side.

## QC
`qc_submissions`, `qc_issues`

Only authorized admins can approve/reject. Approval must be audited.

## Returns and payouts
`returns`, `return_items`, `payouts`, `payout_items`

Financial history must not be physically deleted after settlement.

## Support
`support_tickets`, `support_messages`

## Storefront management
`themes`, `pages`, `page_sections`, `theme_revisions`, `navigation`, `navigation_items`, `media_assets`, `banners`

Theme publishing creates a new revision. Rollback creates a new revision; history is preserved.

## Security
Never store plaintext passwords. Never expose credentials or private documents. Enforce ownership and role checks server-side.

## Indexing
Index common filters and joins: seller_id, category_id, status, approval_status, slug, order_number, payment_status, shipment status, QC status, created_at.

## Migration rule
All schema changes use reviewed, versioned migrations. Do not patch production tables manually.
