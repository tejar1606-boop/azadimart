import { neonConfig, Pool } from "@neondatabase/serverless";
import { randomBytes, scryptSync } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") throw new Error("Demo seed is disabled when NODE_ENV=production.");
if (process.env.ALLOW_DEMO_SEED !== "YES") {
  throw new Error("Set ALLOW_DEMO_SEED=YES to explicitly enable the demo seed.");
}

// The HTTP client has no interactive transactions; use a WebSocket pool
// (Node 22+ provides a global WebSocket).
neonConfig.webSocketConstructor = globalThis.WebSocket;
const pool = new Pool({ connectionString: databaseUrl });
const now = new Date();

function uuid() {
  return crypto.randomUUID();
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

const password = process.env.DEMO_PASSWORD || "AzadiDemo2026!";

const adminUserId = uuid();
const sellerUserId = uuid();
const customerUserId = uuid();
const sellerId = uuid();
const customerId = uuid();
const categoryId = uuid();
const productId = uuid();
const variantId = uuid();
const inventoryId = uuid();
const cartId = uuid();

const client = await pool.connect();
const tx = async (strings, ...values) =>
  (await client.query(strings[0] + values.map((_, i) => "$" + (i + 1) + strings[i + 1]).join(""), values)).rows;

try {
  await client.query("BEGIN");
  const existing = await tx`
    select
      (select id from users where email = 'demo.admin@azadimart.test' limit 1) as admin_id,
      (select id from users where email = 'demo.seller@azadimart.test' limit 1) as seller_user_id,
      (select id from users where email = 'demo.customer@azadimart.test' limit 1) as customer_user_id
  `;

  if (existing[0]?.admin_id || existing[0]?.seller_user_id || existing[0]?.customer_user_id) {
    throw new Error("Demo accounts already exist. Seed is intentionally non-destructive.");
  }

  await tx`
    insert into users (id, email, password_hash, role, status, created_at, updated_at)
    values
      (${adminUserId}, 'demo.admin@azadimart.test', ${hashPassword(password)}, 'ADMIN', 'ACTIVE', ${now}, ${now}),
      (${sellerUserId}, 'demo.seller@azadimart.test', ${hashPassword(password)}, 'SELLER', 'ACTIVE', ${now}, ${now}),
      (${customerUserId}, 'demo.customer@azadimart.test', ${hashPassword(password)}, 'CUSTOMER', 'ACTIVE', ${now}, ${now})
  `;

  await tx`
    insert into sellers (
      id, user_id, store_name, legal_name, tax_identity_type, gstin, business_state,
      tax_declaration_accepted_at, pan, status, approved_at, approved_by_user_id, created_at, updated_at
    )
    values (
      ${sellerId}, ${sellerUserId}, 'Bharat Demo Store', 'Bharat Demo Store Private Limited',
      'GSTIN', '29ABCDE1234F1Z5', 'Karnataka', ${now}, 'ABCDE1234F', 'ACTIVE', ${now}, ${adminUserId}, ${now}, ${now}
    )
  `;

  await tx`
    insert into seller_verifications (
      id, seller_id, status, notes, reviewed_by_user_id, reviewed_at, created_at, updated_at
    )
    values (
      ${uuid()}, ${sellerId}, 'APPROVED', 'Demo seller approved for staging QA only.',
      ${adminUserId}, ${now}, ${now}, ${now}
    )
  `;

  await tx`
    insert into customers (id, user_id, full_name, created_at, updated_at)
    values (${customerId}, ${customerUserId}, 'Demo Customer', ${now}, ${now})
  `;

  await tx`
    insert into carts (id, customer_id, created_at, updated_at)
    values (${cartId}, ${customerId}, ${now}, ${now})
  `;

  await tx`
    insert into categories (id, slug, name, is_active, sort_order, created_at, updated_at)
    values (${categoryId}, 'demo-home', 'Demo Home & Kitchen', true, 1, ${now}, ${now})
  `;

  await tx`
    insert into products (
      id, seller_id, category_id, title, slug, description, status, created_at, updated_at
    )
    values (
      ${productId}, ${sellerId}, ${categoryId}, 'AzadiMart Demo Everyday Kitchen Set',
      'azadimart-demo-everyday-kitchen-set',
      'A staging-only sample product used to test catalog, cart and checkout flows.',
      'LIVE', ${now}, ${now}
    )
  `;

  await tx`
    insert into product_variants (
      id, product_id, sku, title, price_paise, compare_at_paise, weight_grams, attributes, is_active, created_at, updated_at
    )
    values (
      ${variantId}, ${productId}, 'DEMO-KITCHEN-001', 'Default', 129900, 159900, 1200,
      '{"size":"Standard"}'::jsonb, true, ${now}, ${now}
    )
  `;

  await tx`
    insert into inventory (
      id, variant_id, seller_id, on_hand, reserved, created_at, updated_at
    )
    values (${inventoryId}, ${variantId}, ${sellerId}, 25, 0, ${now}, ${now})
  `;
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

console.log("AzadiMart demo seed completed.");
console.log("Admin:    demo.admin@azadimart.test");
console.log("Seller:   demo.seller@azadimart.test");
console.log("Customer: demo.customer@azadimart.test");
console.log("Password:", password);
console.log("Product:  AzadiMart Demo Everyday Kitchen Set");
