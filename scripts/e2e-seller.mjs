// End-to-end smoke test for seller onboarding: registration, KYC upload and
// submission, admin review (document download) and approval, then product
// media upload and public serving. Requires the demo seed and seller, admin and
// storefront apps running against the same NON-PRODUCTION database and storage.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:seller
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
  return async (path, { method = "GET", body, form } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined), redirect: "manual" });
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

// product media: 1x1 PNG
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const imgForm = new FormData(); imgForm.set("file", new Blob([png], { type: "image/png" }), "p.png"); imgForm.set("kind", "IMAGE");
r = await seller("/api/v1/media/products", { method: "POST", form: imgForm });
const imageId = r.json?.mediaAssetId;
check("approved seller uploads product image", r.status === 201 && Boolean(imageId), r.status + " " + JSON.stringify(r.json?.error ?? ""));
const fakeVideo = new FormData(); fakeVideo.set("file", new Blob(["not a video"], { type: "video/mp4" }), "v.mp4"); fakeVideo.set("kind", "VIDEO");
r = await seller("/api/v1/media/products", { method: "POST", form: fakeVideo });
check("fake video rejected by signature check", r.status === 400, String(r.status));
const [img] = await sql`select storage_key from media_assets where id=${imageId}`;
let m = await fetch(`${SF}/media/${img.storage_key}`);
check("storefront serves product image from shared storage", m.status === 200 && m.headers.get("content-type") === "image/png", String(m.status));
m = await fetch(`${AD}/media/${img.storage_key}`);
check("admin QC can view product image", m.status === 200, String(m.status));
check("traversal key rejected", (await fetch(`${SF}/media/product-media/..%2F..%2Fpackage.json`)).status === 404);

const [cat] = await sql`select id from categories where is_active limit 1`;
r = await seller("/api/v1/products", { method: "POST", body: { title: "E2E Weighted Product", categoryId: cat.id, imageAssetIds: [imageId], variant: { sku: "E2E-" + Date.now(), pricePaise: 49900, weightGrams: 750, onHand: 10 } } });
check("approved seller creates product", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const [v] = await sql`select v.weight_grams from product_variants v join products p on p.id=v.product_id where p.id=${r.json?.product?.id ?? null}`;
check("variant package weight saved", v?.weight_grams === 750, JSON.stringify(v));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
