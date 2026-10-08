// Test catalogue for NON-PRODUCTION environments: categories plus ~16 products
// for the demo seller, taken through the real flow (direct media upload ->
// seller creates draft -> QC submission -> admin QC + listing approval).
// Products end in a mix of states so seller/admin screens show realistic data.
//
// Requires the demo seed (pnpm db:seed:demo) and the seller + admin apps running:
//   ALLOW_DEMO_SEED=YES SELLER_URL=http://localhost:3001 ADMIN_URL=http://localhost:3002 pnpm db:seed:catalog
// Optional: SEED_IMAGES_DIR=/path with <key>.webp|png|jpg square images (else plain placeholders are generated).
// Safe to re-run: existing products (same title for the seller) are skipped.
import { existsSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("Catalog seed is disabled when NODE_ENV=production.");
if (process.env.ALLOW_DEMO_SEED !== "YES") throw new Error("Set ALLOW_DEMO_SEED=YES to seed test products.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PASSWORD = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const SELLER_EMAIL = process.env.SEED_SELLER_EMAIL || "demo.seller@azadimart.test";
const IMAGES = process.env.SEED_IMAGES_DIR;
const sql = neon(process.env.DATABASE_URL);

const CATEGORIES = [
  ["home-kitchen", "Home & Kitchen", 1],
  ["fashion", "Fashion", 2],
  ["beauty-personal-care", "Beauty & Personal Care", 3],
  ["electronics-accessories", "Electronics & Accessories", 4],
  ["grocery-gourmet", "Grocery & Gourmet", 5],
  ["travel-luggage", "Travel & Luggage", 6],
  ["sports-fitness", "Sports & Fitness", 7],
];

// [image key, title, category slug, price ₹, MRP ₹, stock, weight g, final state, description]
const PRODUCTS = [
  ["steel-kadai", "Tri-Ply Stainless Steel Kadai with Lid, 24 cm", "home-kitchen", 1499, 2299, 40, 1800, "LIVE", "Even-heating tri-ply body, induction and gas compatible, with a toughened glass lid."],
  ["copper-bottle", "Pure Copper Water Bottle, 1 Litre", "home-kitchen", 749, 1199, 60, 450, "LIVE", "Leak-proof hammered copper bottle for everyday hydration."],
  ["cotton-bedsheet", "Jaipuri Cotton Double Bedsheet with 2 Pillow Covers", "home-kitchen", 899, 1599, 35, 900, "LIVE", "Hand-block inspired print on 180 TC cotton. Machine washable."],
  ["kurta-set", "Women's Cotton Kurta Set with Dupatta", "fashion", 1299, 2499, 25, 500, "LIVE", "Breathable straight-cut kurta, palazzo and printed dupatta."],
  ["linen-shirt", "Men's Linen Casual Shirt, Slim Fit", "fashion", 999, 1799, 30, 300, "LIVE", "Lightweight linen blend with a relaxed collar for warm days."],
  ["kolhapuri", "Handmade Leather Kolhapuri Chappal", "fashion", 849, 1299, 3, 600, "LIVE", "Traditional hand-stitched leather sole from Kolhapur artisans."],
  ["face-serum", "Vitamin C Face Serum, 30 ml", "beauty-personal-care", 449, 699, 80, 120, "LIVE", "Brightening serum with 10% vitamin C and hyaluronic acid."],
  ["herbal-shampoo", "Herbal Shampoo with Bhringraj & Amla, 300 ml", "beauty-personal-care", 299, 399, 0, 350, "LIVE", "Sulphate-free formula for everyday hair care."],
  ["earbuds", "Wireless Earbuds with 40 h Playback", "electronics-accessories", 1799, 3999, 50, 150, "LIVE", "Bluetooth 5.3, low-latency mode and fast USB-C charging."],
  ["power-bank", "20000 mAh Fast-Charging Power Bank", "electronics-accessories", 1299, 2199, 45, 420, "LIVE", "22.5 W output with dual USB-A and USB-C ports."],
  ["masala-chai", "Assam Masala Chai, 500 g", "grocery-gourmet", 349, 450, 120, 550, "LIVE", "Strong CTC tea blended with cardamom, ginger and cinnamon."],
  ["dry-fruits", "Premium Dry Fruits Mix, 1 kg", "grocery-gourmet", 999, 1399, 4, 1100, "PENDING_ADMIN_APPROVAL", "Almonds, cashews, raisins and pistachios, freshly packed."],
  ["cabin-trolley", "Hard-Shell Cabin Trolley, 55 cm", "travel-luggage", 2999, 5999, 20, 3200, "LIVE", "Polycarbonate shell, 360° spinner wheels and TSA lock."],
  ["backpack", "Laptop Backpack 30 L with USB Port", "travel-luggage", 1199, 2499, 30, 800, "PENDING_QC", "Water-resistant fabric, padded 15.6\" laptop sleeve."],
  ["yoga-mat", "Anti-Slip Yoga Mat, 6 mm", "sports-fitness", 699, 1299, 40, 1000, "QC_REJECTED", "Dual-layer TPE with alignment lines and carry strap."],
  ["cricket-bat", "Kashmir Willow Cricket Bat, Full Size", "sports-fitness", 1899, 2999, 15, 1200, "DRAFT", "Hand-crafted Kashmir willow with a cane handle."],
];

let created = 0, skipped = 0;
const log = (...args) => console.log(...args);

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw, contentType } = {}) => {
    const headers = { cookie };
    if (body) headers["content-type"] = "application/json";
    if (raw) headers["content-type"] = contentType;
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const json = await res.json().catch(() => null);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message ?? ""}`);
    return json;
  };
}

/** Plain square placeholder (gradient + band) when no image folder is given. */
function placeholderPng(seed) {
  const W = 1000;
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [r, g, b] = [150 + (h % 90), 110 + ((h >> 8) % 110), 90 + ((h >> 16) % 130)];
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((1 + W * 3) * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = y * (1 + W * 3) + 1 + x * 3, t = (x + y) / (2 * W), band = Math.abs(y - W * 0.45) < W * 0.18 && Math.abs(x - W / 2) < W * 0.28;
    rows[o] = band ? 255 : 255 - t * (255 - r); rows[o + 1] = band ? 255 : 255 - t * (255 - g); rows[o + 2] = band ? 255 : 255 - t * (255 - b);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

function imageFor(key) {
  for (const [ext, type] of [["webp", "image/webp"], ["png", "image/png"], ["jpg", "image/jpeg"]]) {
    const path = `${IMAGES}/${key}.${ext}`;
    if (IMAGES && existsSync(path)) return { bytes: readFileSync(path), type };
  }
  return { bytes: placeholderPng(key), type: "image/png" };
}

// 1. Categories (test data only; there is no admin category screen yet).
for (const [slug, name, sortOrder] of CATEGORIES) {
  await sql`insert into categories (slug, name, is_active, sort_order) values (${slug}, ${name}, true, ${sortOrder})
            on conflict (slug) do update set name = excluded.name, is_active = true, sort_order = excluded.sort_order`;
}
const categoryIds = Object.fromEntries((await sql`select slug, id from categories`).map((row) => [row.slug, row.id]));
log(`categories ready: ${CATEGORIES.length}`);

// 2. Products through the real seller/admin flow.
const seller = client(SE), admin = client(AD);
await seller("/api/auth/login", { method: "POST", body: { email: SELLER_EMAIL, password: PASSWORD } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PASSWORD } });
const [sellerRow] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = ${SELLER_EMAIL}`;

async function upload(bytes, type) {
  const ticket = await seller("/api/v1/media/uploads", { method: "POST", body: { purpose: "PRODUCT_IMAGE", contentType: type, byteSize: bytes.length } });
  if (ticket.uploadUrl.startsWith("/")) {
    // Local storage driver: the app receives the file (needs the seller session).
    await seller(ticket.uploadUrl, { method: "PUT", raw: bytes, contentType: type });
  } else {
    // S3/R2: signed URL, no cookies.
    const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: bytes });
    if (!put.ok) throw new Error("storage upload failed: " + put.status);
  }
  return seller("/api/v1/media/uploads/complete", { method: "POST", body: { token: ticket.token } });
}

for (const [key, title, category, price, mrp, stock, weight, state, description] of PRODUCTS) {
  const [existing] = await sql`select id from products where seller_id = ${sellerRow.id} and title = ${title} limit 1`;
  if (existing) { skipped++; continue; }
  const image = imageFor(key);
  const media = await upload(image.bytes, image.type);
  const { product } = await seller("/api/v1/products", {
    method: "POST",
    body: {
      title, description, categoryId: categoryIds[category], imageAssetIds: [media.mediaAssetId],
      variant: { sku: `AZM-${key.toUpperCase()}`, title: "Standard", pricePaise: price * 100, compareAtPaise: mrp * 100, weightGrams: weight, onHand: stock },
    },
  });
  if (state !== "DRAFT") {
    await seller("/api/v1/qc-submissions", { method: "POST", body: { productId: product.id, notes: "Test catalogue" } });
    if (state !== "PENDING_QC") {
      const [submission] = await sql`select id from qc_submissions where product_id = ${product.id} order by created_at desc limit 1`;
      const rejected = state === "QC_REJECTED";
      await admin("/api/v1/qc", { method: "POST", body: { qcSubmissionId: submission.id, decision: rejected ? "REJECTED" : "APPROVED", notes: rejected ? "Please add a photo of the mat rolled up and the thickness label." : "Looks good" } });
      if (state === "LIVE") await admin("/api/v1/products", { method: "POST", body: { productId: product.id, decision: "APPROVED" } });
    }
  }
  const [final] = await sql`select status from products where id = ${product.id}`;
  log(`${final.status.padEnd(23)} ${title}`);
  created++;
}
log(`\ncreated ${created}, skipped ${skipped} (already present)`);
