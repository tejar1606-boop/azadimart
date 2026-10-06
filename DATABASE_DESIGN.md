# AzadiMart — Database Design

## 1. Database

Database engine:

- PostgreSQL
- Neon PostgreSQL

All production database changes must use versioned migrations.

Never modify production tables manually without a migration.

---

## 2. Database Principles

The database must prioritize:

- Data integrity
- Foreign-key relationships
- Transaction safety
- Seller data isolation
- Auditability
- Idempotency for financial operations
- Soft deletion where appropriate
- UUID primary keys
- UTC timestamps
- Explicit status values
- Database constraints in addition to application validation

Primary keys should use UUIDs.

Every operational table should normally include:

- id
- created_at
- updated_at

Use `timestamptz` for timestamps.

---



# 3. Identity and Access



## users

Stores the platform identity.

Columns:

- id UUID PK
- email
- phone
- password_hash or external_auth_id
- status
- last_login_at
- created_at
- updated_at

Unique:

- email
- phone

Do not store plaintext passwords.

---



## roles

Columns:

- id UUID PK
- name
- description
- created_at

Examples:

- CUSTOMER
- SELLER
- ADMIN
- SUPER_ADMIN
- QC_ADMIN
- FINANCE_ADMIN
- OPERATIONS_ADMIN
- SUPPORT_ADMIN

---



## user_roles

Columns:

- user_id UUID FK [users.id](http://users.id)
- role_id UUID FK [roles.id](http://roles.id)
- created_at

Primary key:

(user_id, role_id)

---



## sessions

Authentication sessions.

Columns:

- id UUID PK
- user_id UUID FK [users.id](http://users.id)
- token_hash
- expires_at
- created_at

Never store raw session secrets when avoidable.

---



# 4. Customers



## customers

Columns:

- id UUID PK
- user_id UUID FK [users.id](http://users.id)
- first_name
- last_name
- display_name
- phone
- email
- status
- created_at
- updated_at

One customer corresponds to one user account.

---



## customer_addresses

Columns:

- id UUID PK
- customer_id UUID FK [customers.id](http://customers.id)
- name
- phone
- address_line1
- address_line2
- landmark
- city
- state
- country
- postal_code
- latitude
- longitude
- address_type
- is_default
- created_at
- updated_at

---



# 5. Sellers



## sellers

Columns:

- id UUID PK
- user_id UUID FK [users.id](http://users.id)
- legal_name
- store_name
- seller_code
- email
- phone
- status
- verification_status
- onboarding_status
- gstin
- pan_last4
- created_at
- updated_at

Suggested statuses:

- pending
- active
- suspended
- rejected
- closed

Never expose internal seller UUIDs unnecessarily in customer-facing URLs.

---



## seller_documents

Columns:

- id UUID PK
- seller_id UUID FK [sellers.id](http://sellers.id)
- document_type
- storage_key
- file_url
- verification_status
- rejection_reason
- verified_by UUID FK [users.id](http://users.id)
- verified_at
- created_at
- updated_at

Documents must be stored in private object storage.

---



## seller_verifications

Columns:

- id UUID PK
- seller_id UUID FK [sellers.id](http://sellers.id)
- verification_type
- status
- reviewed_by UUID FK [users.id](http://users.id)
- notes
- reviewed_at
- created_at
- updated_at

---



## seller_bank_accounts

Columns:

- id UUID PK
- seller_id UUID FK [sellers.id](http://sellers.id)
- account_holder_name
- bank_name
- account_number_encrypted
- ifsc
- verification_status
- created_at
- updated_at

Never expose complete bank-account information in APIs.

---



## seller_settings

Columns:

- seller_id UUID PK/FK [sellers.id](http://sellers.id)
- notification_settings JSONB
- return_settings JSONB
- shipping_settings JSONB
- business_settings JSONB
- created_at
- updated_at

---



# 6. Catalog



## categories

Columns:

- id UUID PK
- parent_id UUID FK [categories.id](http://categories.id) NULL
- name
- slug
- description
- image_url
- sort_order
- is_active
- created_at
- updated_at

Use a self-referencing parent_id for nested categories.

---



## brands

Columns:

- id UUID PK
- name
- slug
- logo_url
- is_verified
- created_at
- updated_at

---



## products

Columns:

- id UUID PK
- seller_id UUID FK [sellers.id](http://sellers.id)
- category_id UUID FK [categories.id](http://categories.id)
- brand_id UUID FK [brands.id](http://brands.id) NULL
- name
- slug
- description
- short_description
- sku
- mrp
- selling_price
- currency
- status
- approval_status
- qc_status
- published_at
- created_at
- updated_at

Statuses:

- draft
- pending_qc
- approved
- rejected
- unpublished
- archived

A product must not become publicly visible unless its approval requirements are satisfied.

---



## product_variants

Columns:

- id UUID PK
- product_id UUID FK [products.id](http://products.id)
- sku
- variant_name
- attributes JSONB
- mrp
- selling_price
- stock_quantity
- weight
- length
- width
- height
- is_active
- created_at
- updated_at

Example attributes:

```json

{

  "color": "Black",

  "size": "XL"

}
```

