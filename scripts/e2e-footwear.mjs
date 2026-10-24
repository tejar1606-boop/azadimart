// End-to-end test for footwear: a seller lists shoes with a UK size set (own
// SKU, price and stock per size); the shop shows a size chart, the category
// page offers only in-stock sizes as a filter, and filtering by size works.
// Requires the demo seed + catalogue seed and the apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… STOREFRONT_URL=… pnpm e2e:footwear
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'productCreate:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
let cookie = "";
const seller = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(SE + path, { method, headers: { cookie, origin: SE, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? []; if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json: await res.json().catch(() => null) };
};
const shop = async (path) => { const r = await fetch(SF + path); return { status: r.status, text: await r.text() }; };
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });

const [footwear] = await sql`select id, slug from categories where slug = 'footwear'`;
const [image] = await sql`select ma.id from media_assets ma join users u on u.id = ma.uploaded_by_user_id where u.email = 'demo.seller@azadimart.test' and ma.kind = 'IMAGE' order by ma.created_at desc limit 1`;
if (!footwear || !image) throw new Error("Need the Footwear category and an image uploaded by the demo seller.");
const RUN = Date.now().toString(36).toUpperCase();
let productId = null;
const tidy = async () => { if (productId) await sql`update products set status = 'ARCHIVED' where id = ${productId}`; };
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

// --- a seller lists running shoes in UK 7, 8, 9 (UK 9 sold out)
const variants = [["UK 7", 4], ["UK 8", 6], ["UK 9", 0]].map(([size, onHand]) => ({ sku: `E2E-SHOE-${RUN}-${size.replace(" ", "")}`, pricePaise: 189900, compareAtPaise: 349900, onHand, color: "Black", colorHex: "#111111", size }));
let r = await seller("/api/v1/products", { method: "POST", body: {
  title: `E2E Running Shoes ${RUN}`, categoryId: footwear.id, couponMaxDiscountPct: 0, description: "",
  specifications: [{ label: "Upper material", value: "Mesh" }, { label: "Sole material", value: "Rubber" }, { label: "Closure", value: "Lace-up" }],
  imageAssetIds: [image.id], variant: { sku: variants[0].sku, title: "Black / UK 7", pricePaise: 189900, weightGrams: 900, onHand: 0 }, variants,
} });
productId = r.json?.product?.id;
check("a seller lists shoes with UK sizes", r.status === 201 && Boolean(productId), JSON.stringify(r.json?.error ?? ""));
const rows = await sql`select attributes->>'size' size, sku, price_paise from product_variants where product_id = ${productId} order by attributes->>'size'`;
check("each size is its own variant with its own SKU", rows.length === 3 && new Set(rows.map((x) => x.sku)).size === 3, rows.map((x) => x.size).join(", "));
await sql`update products set status = 'LIVE' where id = ${productId}`; // (QC approval is covered by e2e:seller)
const [slug] = await sql`select slug from products where id = ${productId}`;

// --- product page: size chart
const page = await shop(`/products/${slug.slug}`);
check("the shoe page shows a size chart", page.status === 200 && page.text.includes("Size chart"), String(page.status));
check("…and the shoe details", page.text.includes("Upper material") && page.text.includes("Lace-up"));
const shirt = (await sql`select p.slug from products p join product_variants v on v.product_id = p.id where p.status = 'LIVE' and v.attributes->>'size' in ('M','L','XL') limit 1`)[0];
if (shirt) check("clothing pages don't show the shoe chart", !(await shop(`/products/${shirt.slug}`)).text.includes("Size chart"));

// --- category page: size filter
const api = async (q) => JSON.parse((await shop(`/api/v1/catalog/products?categoryId=${footwear.id}&limit=48${q}`)).text);
let c = await api("");
check("Footwear offers only in-stock sizes to filter by", c.sizeOptions?.includes("UK 7") && c.sizeOptions.includes("UK 8") && !c.sizeOptions.includes("UK 9"), JSON.stringify(c.sizeOptions));
check("sizes are in order", c.sizeOptions.indexOf("UK 7") < c.sizeOptions.indexOf("UK 8"));
c = await api("&size=UK%208");
check("filtering by UK 8 shows the shoes", c.items.some((p) => p.id === productId));
c = await api("&size=UK%209");
check("a sold-out size doesn't show them", !c.items.some((p) => p.id === productId));
c = await api("&size=UK%2012");
check("a size nobody stocks shows nothing", c.items.length === 0);

// (Size sets and size ordering are covered by packages/shared/src/footwear.test.ts.)

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
