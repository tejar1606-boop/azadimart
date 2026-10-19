// End-to-end test for team access in the admin portal: ready-made and custom
// roles, adding members with their own sign-in, every area enforced on the
// server (allowed and refused APIs and pages per role), role and role-edit
// changes taking effect at once, no privilege escalation (can't give more
// than you have, can't change yourself or someone with more access), switch
// off / on, password reset and audit. Requires the demo seed and all three
// apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES ADMIN_URL=… pnpm e2e:team
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
// Banners (home, page, seller ads) live in the separate Banner Studio app.
const ST = process.env.STUDIO_URL ?? "http://localhost:3003";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toLowerCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base = AD) {
  let cookie = "";
  return async (path, { method = "GET", body, redirect = "follow" } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, location: res.headers.get("location") };
  };
}
const admin = client();
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const [demoAdmin] = await sql`select id from users where email = 'demo.admin@azadimart.test'`;

const created = { users: [], roles: [] };
async function tidy() {
  for (const id of [...created.users].reverse()) {
    await sql`update support_tickets set assigned_to_user_id = null where assigned_to_user_id = ${id}`;
    await sql`delete from audit_logs where actor_user_id = ${id} or entity_id = ${id}`;
    await sql`delete from users where id = ${id}`;
  }
  for (const id of created.roles) { await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from roles where id = ${id}`; }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

// --- roles
let team = (await admin("/api/v1/team")).json;
const role = (name) => team.roles.find((r) => r.name === name);
check("ready-made roles exist", ["Admin", "Operations", "Catalogue & QC", "Seller onboarding", "Finance", "Marketing", "Support agent"].every((n) => role(n)));
check("an older admin without a role has full access", team.me.fullAccess && team.members.some((m) => m.userId === demoAdmin.id && m.roleName === "Admin (full access)"));
let r = await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Returns ${RUN}`, description: "Returns desk", permissions: ["orders", "support"] } });
const returnsRole = r.json?.role?.id; if (returnsRole) created.roles.push(returnsRole);
check("admin creates a custom role", r.status === 201 && returnsRole);
check("role names are unique", (await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Returns ${RUN}`, permissions: ["orders"] } })).status === 409);
check("a role needs at least one known area", (await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Empty ${RUN}`, permissions: [] } })).status === 400 && (await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Bad ${RUN}`, permissions: ["everything"] } })).status === 400);
r = await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Lead ${RUN}`, permissions: ["team", "catalog", "dashboard"] } });
const leadRole = r.json?.role?.id; if (leadRole) created.roles.push(leadRole);

// Test roles with fixed areas (ready-made roles may have been edited by the team).
const testRole = async (name, permissions) => { const res = await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E ${name} ${RUN}`, permissions } }); created.roles.push(res.json.role.id); return res.json.role.id; };
const R = {
  catalog: await testRole("Catalogue", ["dashboard", "catalog"]),
  finance: await testRole("Finance", ["dashboard", "payments", "orders"]),
  marketing: await testRole("Marketing", ["dashboard", "storefront", "marketing"]),
  support: await testRole("Support", ["support"]),
  banners: await testRole("Banners", ["banners"]),
};

// --- members
const members = {};
async function addMember(key, roleId) {
  const email = `e2e.team.${key}.${RUN}@azadimart.test`;
  const res = await admin("/api/v1/team/members", { method: "POST", body: { displayName: `E2E ${key}`, email, password: "TeamPass2026!", roleId } });
  const id = res.json?.member?.userId;
  if (id) created.users.push(id);
  const c = client();
  const login = await c("/api/auth/login", { method: "POST", body: { email, password: "TeamPass2026!" } });
  members[key] = { id, email, c, status: res.status, login: login.status };
}
team = (await admin("/api/v1/team")).json;
await addMember("catalog", R.catalog);
await addMember("finance", R.finance);
await addMember("marketing", R.marketing);
await addMember("support", R.support);
await addMember("banners", R.banners);
await addMember("returns", returnsRole);
await addMember("lead", leadRole);
check("admin adds team members with their own sign-in", Object.values(members).every((m) => m.status === 201 && m.login === 200), JSON.stringify(Object.fromEntries(Object.entries(members).map(([k, m]) => [k, [m.status, m.login]]))));
check("email must be unused", (await admin("/api/v1/team/members", { method: "POST", body: { displayName: "Dup", email: members.catalog.email, password: "TeamPass2026!", roleId: R.finance } })).status === 409);
let session = (await members.finance.c("/api/auth/session")).json;
check("session reports the role and its areas", session?.roleName === `E2E Finance ${RUN}` && session.permissions.includes("payments") && !session.permissions.includes("catalog") && session.fullAccess === false);

// --- every area enforced on the server
const allowed = async (key, paths, expect) => {
  const results = [];
  for (const [path, method] of paths) results.push([path, (await members[key].c(path, { method: method ?? "GET", body: method === "POST" ? {} : undefined })).status]);
  return results.every(([, s]) => (expect ? s !== 401 && s !== 403 : s === 403)) ? "" : JSON.stringify(results);
};
const t = async (name, key, paths, expect) => { const bad = await allowed(key, paths, expect); check(name, !bad, bad); };
await t("Catalogue & QC can open catalogue areas", "catalog", [["/api/v1/qc"], ["/api/v1/products"], ["/api/v1/reviews"], ["/api/v1/aplus"], ["/api/v1/catalog/categories"]], true);
await t("Catalogue & QC can't open orders, money, sellers, support or team", "catalog", [["/api/v1/orders"], ["/api/v1/payouts"], ["/api/v1/sellers"], ["/api/v1/support/tickets"], ["/api/v1/team"], ["/api/v1/coupons"], ["/api/v1/online-store/homepage"]], false);
await t("Finance can open payments and orders", "finance", [["/api/v1/payouts"], ["/api/v1/orders"], ["/api/v1/sellers"]], true);
await t("Finance can't open catalogue, store design, marketing or logistics", "finance", [["/api/v1/qc"], ["/api/v1/online-store/homepage"], ["/api/v1/catalog/categories", "POST"]], false);
await t("Marketing can open store design, coupons, ads (and pick sellers/products for them)", "marketing", [["/api/v1/coupons"], ["/api/v1/online-store/homepage"], ["/api/v1/sellers"], ["/api/v1/catalog/products"], ["/api/v1/offer-tags"]], true);
await t("Marketing can't change categories or open orders and payouts", "marketing", [["/api/v1/catalog/categories", "POST"], ["/api/v1/orders"], ["/api/v1/payouts"], ["/api/v1/qc"]], false);
// --- Banner Studio (separate app): only roles with the Banner Studio area may sign in there
const studioMember = async (key) => { const c = client(ST); const res = await c("/api/auth/login", { method: "POST", body: { email: members[key].email, password: "TeamPass2026!" } }); return { c, status: res.status }; };
const bannerTeam = await studioMember("banners");
const bannerApis = await Promise.all(["/api/v1/home-banners", "/api/v1/page-banners", "/api/v1/ads/slots"].map(async (p) => (await bannerTeam.c(p)).status));
check("Banner team signs in to the Banner Studio and opens every banner screen", bannerTeam.status === 200 && bannerApis.every((s) => s === 200), JSON.stringify([bannerTeam.status, bannerApis]));
await t("Banner team can't open anything in Admin", "banners", [["/api/v1/orders"], ["/api/v1/coupons"], ["/api/v1/online-store/homepage"], ["/api/v1/catalog/products"]], false);
r = await members.banners.c("/dashboard", { redirect: "manual" });
check("Banner team opening Admin is sent to the Banner Studio", [307, 308].includes(r.status) && Boolean(r.location?.startsWith(ST)), `${r.status} ${r.location}`);
const marketingStudio = await studioMember("marketing");
check("roles with Online store can also use the Banner Studio", marketingStudio.status === 200 && (await marketingStudio.c("/api/v1/ads/slots")).status === 200);
check("roles without banners are refused at the Banner Studio sign-in", (await studioMember("finance")).status === 403 && (await studioMember("catalog")).status === 403);
check("the Banner Studio refuses Admin-only roles' sessions", (await members.finance.c("/api/v1/orders")).status === 200 && (await client(ST)("/api/v1/home-banners")).status === 401);
await t("Support agent can open only the support desk", "support", [["/api/v1/support/tickets"], ["/api/v1/support/canned"]], true);
await t("Support agent is refused everywhere else", "support", [["/api/v1/orders"], ["/api/v1/coupons"], ["/api/v1/qc"], ["/api/v1/catalog/products"], ["/api/v1/team"]], false);
await t("custom role gets exactly its areas", "returns", [["/api/v1/orders"], ["/api/v1/abandoned-carts"], ["/api/v1/support/tickets"]], true);
await t("custom role is refused outside them", "returns", [["/api/v1/payouts"], ["/api/v1/qc"]], false);
r = await members.support.c("/dashboard", { redirect: "manual" });
check("pages outside the role redirect to the first allowed page", [307, 308].includes(r.status) && r.location?.endsWith("/support"), `${r.status} ${r.location}`);
r = await members.catalog.c("/sellers", { redirect: "manual" });
check("Sellers & KYC page refused for Catalogue & QC", [307, 308].includes(r.status) && r.location?.endsWith("/dashboard"), `${r.status} ${r.location}`);
check("pages inside the role open", (await members.catalog.c("/dashboard", { redirect: "manual" })).status === 200);

// --- changes apply at once
await admin(`/api/v1/team/members/${members.finance.id}`, { method: "PATCH", body: { roleId: R.support } });
check("changing a role applies without signing in again", (await members.finance.c("/api/v1/payouts")).status === 403 && (await members.finance.c("/api/v1/support/tickets")).status === 200);
await admin(`/api/v1/team/roles/${returnsRole}`, { method: "PATCH", body: { permissions: ["orders", "support", "payments"] } });
check("editing a role applies to everyone with it", (await members.returns.c("/api/v1/payouts")).status === 200);

// --- no privilege escalation
const lead = members.lead.c;
check("a team lead can open Team & roles", (await lead("/api/v1/team")).status === 200);
check("…but can't add someone with more access than they have", (await lead("/api/v1/team/members", { method: "POST", body: { displayName: "Too much", email: `e2e.team.x.${RUN}@azadimart.test`, password: "TeamPass2026!", roleId: R.finance } })).status === 403);
r = await lead("/api/v1/team/members", { method: "POST", body: { displayName: "E2E lead hire", email: `e2e.team.hire.${RUN}@azadimart.test`, password: "TeamPass2026!", roleId: R.catalog } });
if (r.json?.member?.userId) created.users.push(r.json.member.userId);
check("…can add someone within their own access", r.status === 201);
check("…can't create a role with areas they don't have", (await lead("/api/v1/team/roles", { method: "POST", body: { name: `E2E Sneaky ${RUN}`, permissions: ["payments"] } })).status === 403);
check("…can't edit a role with more access", (await lead(`/api/v1/team/roles/${R.finance}`, { method: "PATCH", body: { permissions: ["catalog"] } })).status === 403);
check("…can't edit their own role", (await lead(`/api/v1/team/roles/${leadRole}`, { method: "PATCH", body: { permissions: ["team", "catalog", "dashboard", "payments"] } })).status === 403);
check("…can't change someone with more access", (await lead(`/api/v1/team/members/${members.finance.id}`, { method: "PATCH", body: { isActive: false } })).status === 403 && (await lead(`/api/v1/team/members/${demoAdmin.id}`, { method: "PATCH", body: { isActive: false } })).status === 403);
check("…can change someone within their access", (await lead(`/api/v1/team/members/${members.catalog.id}`, { method: "PATCH", body: { displayName: "E2E Catalogue" } })).status === 200);
check("nobody can change their own access", (await lead(`/api/v1/team/members/${members.lead.id}`, { method: "PATCH", body: { roleId: R.finance } })).status === 403 && (await admin(`/api/v1/team/members/${demoAdmin.id}`, { method: "PATCH", body: { isActive: false } })).status === 403);

// --- deleting roles
check("a role in use can't be deleted", (await admin(`/api/v1/team/roles/${returnsRole}`, { method: "DELETE" })).status === 409);
check("ready-made roles can't be deleted", (await admin(`/api/v1/team/roles/${role("Marketing").id}`, { method: "DELETE" })).status === 409);
r = await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Temp ${RUN}`, permissions: ["logistics"] } });
check("an unused custom role can be deleted", (await admin(`/api/v1/team/roles/${r.json.role.id}`, { method: "DELETE" })).status === 200);

// --- switch off / on, password reset
await admin(`/api/v1/team/members/${members.marketing.id}`, { method: "PATCH", body: { isActive: false } });
check("switching off signs them out at once", [401, 403].includes((await members.marketing.c("/api/v1/coupons")).status));
check("…and they can't sign in", (await client()("/api/auth/login", { method: "POST", body: { email: members.marketing.email, password: "TeamPass2026!" } })).status === 401);
await admin(`/api/v1/team/members/${members.marketing.id}`, { method: "PATCH", body: { isActive: true } });
check("switching on lets them sign in again", (await members.marketing.c("/api/auth/login", { method: "POST", body: { email: members.marketing.email, password: "TeamPass2026!" } })).status === 200 && (await members.marketing.c("/api/v1/coupons")).status === 200);
await admin(`/api/v1/team/members/${members.support.id}`, { method: "PATCH", body: { password: "NewTeamPass2026!" } });
check("password reset signs them out; the new password works and the old one doesn't",
  [401, 403].includes((await members.support.c("/api/v1/support/tickets")).status)
  && (await client()("/api/auth/login", { method: "POST", body: { email: members.support.email, password: "TeamPass2026!" } })).status === 401
  && (await client()("/api/auth/login", { method: "POST", body: { email: members.support.email, password: "NewTeamPass2026!" } })).status === 200);

const audits = await sql`select action from audit_logs where created_at > now() - interval '15 minutes' and action like 'TEAM_%'`;
check("team changes are audited", ["TEAM_MEMBER_ADDED", "TEAM_MEMBER_UPDATED", "TEAM_ROLE_CREATED", "TEAM_ROLE_UPDATED", "TEAM_ROLE_DELETED"].every((a) => audits.some((x) => x.action === a)));

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
