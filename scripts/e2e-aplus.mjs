// End-to-end test for A+ content: seller editing (every block type, media
// ownership and comparison rules), submission, admin review (request changes,
// approve), storefront display, and drafts staying hidden until approved.
// Requires the demo seed + catalogue seed and the seller, admin and storefront
// apps running against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:aplus
import { deflateSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw, contentType } = {}) => {
    const headers = { cookie };
    if (body) headers["content-type"] = "application/json";
    if (raw) headers["content-type"] = contentType;
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null), text: res.headers.get("content-type")?.includes("html") ? await res.text().catch(() => "") : "" };
  };
}

function png(width, height) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((1 + width * 3) * height, 180); for (let y = 0; y < height; y++) rows[y * (1 + width * 3)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const seller = client(SE), admin = client(AD);
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });

async function upload(purpose, bytes) {
  const t = await seller("/api/v1/media/uploads", { method: "POST", body: { purpose, contentType: "image/png", byteSize: bytes.length } });
  await seller(t.json.uploadUrl, { method: "PUT", raw: bytes, contentType: "image/png" });
  return (await seller("/api/v1/media/uploads/complete", { method: "POST", body: { token: t.json.token } })).json;
}

const [demoSeller] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const live = await sql`select id, slug, title from products where seller_id = ${demoSeller.id} and status = 'LIVE' order by created_at limit 3`;
const [target, other1, other2] = live;
const [foreign] = await sql`select id from products where seller_id <> ${demoSeller.id} limit 1`;

const banner = await upload("APLUS_IMAGE", png(1464, 600));
const bannerMobile = await upload("APLUS_IMAGE", png(600, 450));
const square = await upload("APLUS_IMAGE", png(1000, 1000));
check("A+ images upload (wide banner allowed for A+)", Boolean(banner?.url && bannerMobile?.url && square?.url), JSON.stringify(banner?.url));

const blocks = [
  { type: "banner", desktopImageUrl: banner.url, mobileImageUrl: bannerMobile.url, alt: "E2E A+ banner" },
  { type: "image_text", heading: "E2E text-only module", body: "No image needed here." },
  { type: "image_text", imageUrl: square.url, imagePosition: "right", heading: "E2E built to last", body: "Polycarbonate shell." },
  { type: "features", heading: "Why you'll love it", items: [{ title: "Light", imageUrl: square.url }, { title: "Strong" }, { title: "Silent wheels" }] },
  { type: "comparison", heading: "Compare", productIds: [other1.id, other2.id], rows: [{ label: "Warranty", values: ["3 years", "1 year", "2 years"] }] },
  { type: "text", heading: "E2E story", body: "Made in India." },
];
let r = await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks } });
check("seller saves all 5 block types (incl. image-text without image)", r.status === 200, r.status + " " + JSON.stringify(r.json?.error ?? ""));

r = await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks: [{ type: "image_text", heading: "x", imageUrl: "https://evil.example/x.jpg" }] } });
check("outside image URL rejected", r.status === 400, String(r.status));
r = await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks: [{ type: "image_text", heading: "x", imageUrl: `/media/product-media/${foreign ? "00000000-0000-4000-8000-000000000000" : demoSeller.id}/00000000-0000-4000-8000-000000000001.png` }] } });
check("another seller's media rejected", r.status === 403, String(r.status));
if (foreign) {
  r = await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks: [{ type: "comparison", productIds: [foreign.id], rows: [{ label: "x", values: [] }] }] } });
  check("comparing with another seller's product rejected", r.status === 403, String(r.status));
}
r = await seller(`/api/v1/products/${foreign?.id ?? "00000000-0000-4000-8000-000000000000"}/aplus`);
check("cannot open another seller's A+ content", r.status === 404, String(r.status));

// the rejected attempts must not have replaced the saved draft
r = await seller(`/api/v1/products/${target.id}/aplus`);
check("draft intact after rejected saves", r.json?.draftBlocks?.length === 6, String(r.json?.draftBlocks?.length));

r = await seller(`/api/v1/products/${target.id}/aplus/submit`, { method: "POST" });
check("seller submits for review", r.status === 200 && r.json?.status === "PENDING_REVIEW", r.status + " " + JSON.stringify(r.json?.error ?? ""));
r = await seller(`/api/v1/products/${target.id}/aplus/submit`, { method: "POST" });
check("double submit rejected", r.status === 409, String(r.status));

r = await admin("/api/v1/aplus");
check("admin sees it in A+ review", r.status === 200 && r.json?.items?.some((i) => i.productId === target.id), String(r.status));
r = await admin(`/api/v1/aplus/${target.id}`, { method: "POST", body: { decision: "REJECTED" } });
check("request changes needs notes", r.status === 400, String(r.status));
r = await admin(`/api/v1/aplus/${target.id}`, { method: "POST", body: { decision: "REJECTED", notes: "E2E: please brighten the banner" } });
check("admin requests changes", r.status === 200, String(r.status));
r = await seller(`/api/v1/products/${target.id}/aplus`);
check("seller sees feedback", r.json?.status === "REJECTED" && /brighten/.test(r.json?.reviewNotes ?? ""), JSON.stringify({ s: r.json?.status, n: r.json?.reviewNotes }));

let page = await fetch(`${SF}/products/${target.slug}`).then((x) => x.text());
check("not shown on storefront before approval", !page.includes("E2E built to last"));

r = await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks } });
r = await seller(`/api/v1/products/${target.id}/aplus/submit`, { method: "POST" });
r = await admin(`/api/v1/aplus/${target.id}`, { method: "POST", body: { decision: "APPROVED" } });
check("admin approves after resubmission", r.status === 200 && r.json?.status === "APPROVED", r.status + " " + JSON.stringify(r.json?.error ?? ""));

page = await fetch(`${SF}/products/${target.slug}`).then((x) => x.text());
check("storefront shows approved A+ content", page.includes("From the seller") && page.includes("E2E built to last") && page.includes("E2E text-only module"));
check("comparison shows the compared products", page.includes(other1.title.replace(/&/g, "&amp;").slice(0, 20)));

// edits after approval stay hidden until approved again
await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks: [{ type: "text", body: "E2E unapproved edit" }] } });
page = await fetch(`${SF}/products/${target.slug}`).then((x) => x.text());
check("unapproved edit does not change the live page", page.includes("E2E built to last") && !page.includes("E2E unapproved edit"));
// restore the approved version as the draft
await seller(`/api/v1/products/${target.id}/aplus`, { method: "PUT", body: { blocks } });

const audits = await sql`select action from audit_logs where entity_id = ${target.id} and action like 'APLUS_%'`;
check("submissions and decisions audited", ["APLUS_SUBMITTED", "APLUS_REJECTED", "APLUS_APPROVED"].every((a) => audits.some((x) => x.action === a)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
