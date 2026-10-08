// End-to-end smoke test for seller onboarding: registration, KYC upload and
// submission, admin review (document download) and approval, then product
// media upload and public serving. Requires the demo seed and seller, admin and
// storefront apps running against the same NON-PRODUCTION database and storage.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:seller
import { deflateSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E smoke test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E smoke test (it writes test data).");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, form, raw, contentType } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    if (raw) headers["content-type"] = contentType;
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: raw ?? form ?? (body ? JSON.stringify(body) : undefined), redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, ct, json: ct.includes("json") ? await res.json() : null, bytes: ct.includes("json") ? null : Buffer.from(await res.arrayBuffer()) };
  };
}
const seller = client(SE), admin = client(AD);
const rnd = () => Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const gstin = `29${rnd()}${String(1000 + Math.floor(Math.random() * 8999))}A1Z5`;
const email = `E2E.Seller.${Date.now()}@AzadiMart.test`;
const phone = "9" + String(Date.now()).slice(-9);

let r = await seller("/api/auth/register", { method: "POST", body: { storeName: "E2E Store", legalName: "E2E Store Pvt Ltd", email, phone, businessState: "Karnataka", taxIdentityType: "GSTIN", gstin, taxDeclarationAccepted: true, password: PW } });
check("seller registers (mixed-case email)", r.status === 201 || r.status === 200, r.status + " " + JSON.stringify(r.json?.error ?? ""));
r = await seller("/api/auth/login", { method: "POST", body: { email: email.toLowerCase(), password: PW } });
check("seller logs in with lowercase email", r.status === 200, String(r.status));
r = await seller("/api/v1/products", { method: "POST", body: { title: "Too early", categoryId: crypto.randomUUID(), imageAssetIds: [crypto.randomUUID()] } });
check("unapproved seller cannot create products", r.status === 403, String(r.status));

const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const docs = {};
for (const type of ["PAN", "BANK_PROOF", "ADDRESS_PROOF", "GST"]) {
  const form = new FormData(); form.set("file", new Blob([pdfBytes], { type: "application/pdf" }), type.toLowerCase() + ".pdf");
  r = await seller("/api/v1/media/documents", { method: "POST", form });
  docs[type] = r.json?.mediaAssetId;
}
check("upload 4 KYC PDFs", Object.values(docs).every(Boolean));
const fake = new FormData(); fake.set("file", new Blob(["<script>alert(1)</script>"], { type: "application/pdf" }), "evil.pdf");
r = await seller("/api/v1/media/documents", { method: "POST", form: fake });
check("non-PDF disguised as PDF rejected", r.status === 400, String(r.status));
r = await seller("/api/v1/kyc", { method: "POST", body: { documents: [{ type: "PAN", mediaAssetId: docs.PAN }] } });
check("KYC with missing documents rejected", r.status === 400, String(r.status));
r = await seller("/api/v1/kyc", { method: "POST", body: { documents: Object.entries(docs).map(([type, mediaAssetId]) => ({ type, mediaAssetId })) } });
check("KYC submitted", r.status === 200 || r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? r.json?.status));
const [s] = await sql`select s.id, s.status from sellers s join users u on u.id=s.user_id where u.email=${email.toLowerCase()}`;
check("seller status KYC_SUBMITTED", s?.status === "KYC_SUBMITTED", JSON.stringify(s));

r = await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
check("admin login", r.status === 200, String(r.status));
const [panDoc] = await sql`select sd.id, ma.storage_key from seller_documents sd join media_assets ma on ma.id=sd.media_asset_id where sd.seller_id=${s.id} and sd.type='PAN'`;
r = await admin(`/api/v1/sellers/${s.id}/documents/${panDoc.id}`);
check("admin downloads KYC document (shared storage)", r.status === 200 && r.bytes?.subarray(0, 5).toString() === "%PDF-", r.status + " " + JSON.stringify(r.json?.error ?? r.ct));
check("document view audited", (await sql`select 1 from audit_logs where action='SELLER_DOCUMENT_VIEWED' and entity_id=${panDoc.id}`).length === 1);
check("anonymous cannot download KYC document", (await fetch(`${AD}/api/v1/sellers/${s.id}/documents/${panDoc.id}`)).status === 401);
check("KYC document never served by storefront /media", (await fetch(`${SF}/media/${panDoc.storage_key}`)).status === 404);

r = await admin("/api/v1/sellers/approval", { method: "POST", body: { sellerId: s.id, decision: "APPROVED", notes: "E2E" } });
check("admin approves seller", r.status === 200, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const [s2] = await sql`select status, approved_at from sellers where id=${s.id}`;
check("seller ACTIVE with approved_at", s2.status === "ACTIVE" && Boolean(s2.approved_at), JSON.stringify(s2));
r = await admin("/api/v1/sellers/approval", { method: "POST", body: { sellerId: s.id, decision: "REJECTED" } });
check("cannot re-decide an approved seller", r.status === 422 || r.status === 409, String(r.status));
r = await seller("/api/v1/kyc", { method: "POST", body: { documents: Object.entries(docs).map(([type, mediaAssetId]) => ({ type, mediaAssetId })) } });
check("approved seller cannot resubmit KYC", r.status === 403, String(r.status));

// product media via direct upload (signed URL -> PUT -> verify)
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((1 + width * 3) * height, 200);
  for (let y = 0; y < height; y++) rows[y * (1 + width * 3)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
async function directUpload(purpose, contentType, bytes) {
  const ticket = await seller("/api/v1/media/uploads", { method: "POST", body: { purpose, contentType, byteSize: bytes.length } });
  if (ticket.status !== 200) return ticket;
  const put = await seller(ticket.json.uploadUrl, { method: "PUT", raw: bytes, contentType });
  if (put.status !== 200) return put;
  return seller("/api/v1/media/uploads/complete", { method: "POST", body: { token: ticket.json.token } });
}
r = await directUpload("PRODUCT_IMAGE", "image/png", makePng(1000, 1000));
const imageId = r.json?.mediaAssetId;
check("approved seller uploads square 1000 × 1000 product image", r.status === 201 && Boolean(imageId), r.status + " " + JSON.stringify(r.json?.error ?? ""));
r = await directUpload("PRODUCT_IMAGE", "image/png", makePng(1200, 800));
check("non-square product image rejected", r.status === 400 && /square/.test(r.json?.error?.message ?? ""), r.status + " " + (r.json?.error?.message ?? ""));
r = await directUpload("PRODUCT_VIDEO", "video/mp4", Buffer.from("not a video at all"));
check("fake video rejected by signature check", r.status === 400, String(r.status));
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(3 * 1024 * 1024, 7)]);
r = await directUpload("PRODUCT_VIDEO", "video/mp4", mp4);
const videoId = r.json?.mediaAssetId;
check("3 MB product video uploads directly", r.status === 201 && r.json?.kind === "VIDEO", r.status + " " + JSON.stringify(r.json?.error ?? ""));
r = await seller("/api/v1/media/uploads", { method: "POST", body: { purpose: "SITE_IMAGE", contentType: "image/png", byteSize: 100 } });
check("seller cannot request admin site-media uploads", r.status === 400, String(r.status));
const [img] = await sql`select storage_key from media_assets where id=${imageId}`;
let m = await fetch(`${SF}/media/${img.storage_key}`);
check("storefront serves product image from shared storage", m.status === 200 && m.headers.get("content-type") === "image/png", String(m.status));
m = await fetch(`${AD}/media/${img.storage_key}`);
check("admin QC can view product image", m.status === 200, String(m.status));
const [vid] = await sql`select storage_key from media_assets where id=${videoId ?? null}`;
m = vid ? await fetch(`${SF}/media/${vid.storage_key}`, { headers: { range: "bytes=0-1023" } }) : { status: 0 };
check("product video streams with byte ranges (206)", m.status === 206, String(m.status));
check("traversal key rejected", (await fetch(`${SF}/media/product-media/..%2F..%2Fpackage.json`)).status === 404);

const [cat] = await sql`select id from categories where is_active limit 1`;
r = await seller("/api/v1/products", { method: "POST", body: { title: "E2E Weighted Product", categoryId: cat.id, imageAssetIds: [imageId], videoAssetId: videoId, variant: { sku: "E2E-" + Date.now(), pricePaise: 49900, weightGrams: 750, onHand: 10 } } });
check("approved seller creates product", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const [v] = await sql`select v.weight_grams from product_variants v join products p on p.id=v.product_id where p.id=${r.json?.product?.id ?? null}`;
check("variant package weight saved", v?.weight_grams === 750, JSON.stringify(v));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
