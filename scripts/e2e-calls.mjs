// End-to-end test for the Call Centre (test telephony line): agents go
// available, an incoming call rings the longest-idle agent with the caller's
// details, declining passes it on, answering/hanging up records the call, an
// unanswered caller becomes a missed call, calling back clears it, notes are
// saved, and only support-desk staff can use any of it. Requires the demo seed
// and the admin app (test server) against a NON-PRODUCTION database.
//   ALLOW_E2E=YES ADMIN_URL=… pnpm e2e:calls
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'login:%' or key like 'ip:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const RUN = Date.now().toString(36);
const started = new Date();
const a = client(AD), b = client(AD), seller = client(SE);
await a("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
const [aUser] = await sql`select id from users where email = 'demo.admin@azadimart.test'`;
// Calls left from earlier runs mustn't ring anyone now.
await sql`update calls set status = 'MISSED', callback_done_at = now() where status in ('QUEUED', 'RINGING', 'IN_PROGRESS')`;

// A second agent with the ready-made "Support agent" role.
const team = (await a("/api/v1/team")).json;
const supportRole = team.roles.find((r) => r.name === "Support agent");
const bEmail = `e2e.agent.${RUN}@loimart.test`;
let r = await a("/api/v1/team/members", { method: "POST", body: { displayName: "E2E Agent B", email: bEmail, password: "TeamPass2026!", roleId: supportRole.id } });
const bUserId = r.json?.member?.userId ?? r.json?.userId ?? (await sql`select id from users where email = ${bEmail}`)[0]?.id;
await b("/api/auth/login", { method: "POST", body: { email: bEmail, password: "TeamPass2026!" } });
async function tidy() {
  await sql`delete from calls where created_at >= ${started}`;
  await sql`update call_agents set status = 'OFFLINE' where user_id = ${aUser.id}`;
  if (bUserId) { await sql`delete from audit_logs where actor_user_id = ${bUserId} or entity_id = ${bUserId}`; await sql`delete from users where id = ${bUserId}`; }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

const state = async (c) => (await c("/api/v1/calls/state")).json;
let sa = await state(a);
check("the test phone line is connected", sa?.line?.name === "test", JSON.stringify(sa?.line ?? sa));
check("a support agent can open the call centre", (await state(b))?.status !== undefined);
check("sellers can't", [401, 403].includes((await seller(`${AD}/api/v1/calls/state`)).status));

// --- incoming call
await a("/api/v1/calls/agent", { method: "PUT", body: { status: "AVAILABLE" } });
await b("/api/v1/calls/agent", { method: "PUT", body: { status: "AVAILABLE" } });
r = await a("/api/v1/calls/simulate", { method: "POST", body: { phone: "9000000011", ivrChoice: "ORDERS" } });
const callId = r.json?.callId;
check("a customer calls LOIMART", r.status === 201 && Boolean(callId), JSON.stringify(r.json?.error ?? ""));
sa = await state(a); let sb = await state(b);
const first = sa.current?.id === callId ? { me: a, other: b, name: "A" } : sb.current?.id === callId ? { me: b, other: a, name: "B" } : null;
check("it rings exactly one available agent", Boolean(first) && !(sa.current && sb.current), JSON.stringify({ a: sa.current?.status, b: sb.current?.status }));
const ringing = (await state(first.me)).current;
check("…who sees who's calling (demo customer, their orders)", ringing?.status === "RINGING" && ringing.caller.customer?.name && ringing.ivrChoice === "ORDERS", JSON.stringify(ringing?.caller?.customer));
r = await first.me(`/api/v1/calls/${callId}`, { method: "PATCH", body: { action: "DECLINE" } });
const second = first.other;
const sSecond = await state(second);
check("declining passes the call to the other agent", r.status === 200 && sSecond.current?.id === callId && sSecond.current.status === "RINGING", JSON.stringify(sSecond.current?.status));
check("the other agent can't answer a call that isn't theirs", (await first.me(`/api/v1/calls/${callId}`, { method: "PATCH", body: { action: "ACCEPT" } })).status === 403);
r = await second(`/api/v1/calls/${callId}`, { method: "PATCH", body: { action: "ACCEPT" } });
check("the agent answers", r.status === 200 && (await state(second)).current?.status === "IN_PROGRESS");

// --- a second caller while the only free agent goes away
await first.me("/api/v1/calls/agent", { method: "PUT", body: { status: "AWAY" } });
r = await a("/api/v1/calls/simulate", { method: "POST", body: { phone: "9876501234", ivrChoice: "OTHER" } });
const call2 = r.json?.callId;
const q = await state(second);
check("with nobody free, the caller waits in the queue", q.queue >= 1 && q.current?.id === callId, JSON.stringify({ queue: q.queue }));
await new Promise((res) => setTimeout(res, 1100));
r = await second(`/api/v1/calls/${callId}`, { method: "PATCH", body: { action: "HANGUP" } });
const [done] = await sql`select status, duration_seconds, wait_seconds from calls where id = ${callId}`;
check("hanging up records an answered call with talk time", r.status === 200 && done.status === "COMPLETED" && done.duration_seconds >= 1 && done.wait_seconds !== null, JSON.stringify(done));
const next = await state(second);
check("the waiting caller rings the agent who just got free", next.current?.id === call2 && next.current.status === "RINGING", JSON.stringify(next.current?.id === call2));
check("an unknown number shows as not a LOIMART account", next.current?.caller.customer === null && next.current.caller.seller === null);
await second(`/api/v1/calls/${call2}`, { method: "PATCH", body: { action: "DECLINE" } });
await sql`update calls set created_at = now() - interval '3 minutes' where id = ${call2}`;
const after = await state(second);
const [missed] = await sql`select status from calls where id = ${call2}`;
check("a caller who waits too long becomes a missed call", missed.status === "MISSED" && after.missed >= 1, missed.status);
r = await second("/api/v1/calls?view=missed");
check("…on the callback list", r.json?.items?.some((x) => x.id === call2));

// --- outgoing call (calling back)
r = await second("/api/v1/calls", { method: "POST", body: { phone: "12345" } });
check("an invalid number is refused", r.status === 400);
r = await second("/api/v1/calls", { method: "POST", body: { phone: "+91 98765 01234" } });
const out = r.json?.callId;
check("the agent calls the customer back", r.status === 201 && Boolean(out), JSON.stringify(r.json?.error ?? ""));
check("…can't start a second call at the same time", (await second("/api/v1/calls", { method: "POST", body: { phone: "9000000011" } })).status === 409);
await new Promise((res) => setTimeout(res, 3300));
check("the customer picks up (test line)", (await state(second)).current?.status === "IN_PROGRESS");
await new Promise((res) => setTimeout(res, 1100));
await second(`/api/v1/calls/${out}`, { method: "PATCH", body: { action: "HANGUP" } });
r = await second("/api/v1/calls?view=missed");
check("calling back clears the missed call", !r.json?.items?.some((x) => x.id === call2));
r = await second(`/api/v1/calls/${out}`, { method: "PATCH", body: { action: "NOTES", outcome: "RESOLVED", notes: "Explained delivery date" } });
const listed = (await second("/api/v1/calls?q=98765")).json?.items?.find((x) => x.id === out);
check("notes and outcome are saved on the call", r.status === 200 && listed?.outcome === "RESOLVED" && listed.notes === "Explained delivery date");

r = await a("/api/v1/calls/stats");
check("today's stats count answered, missed and outgoing calls", r.json?.inboundAnswered >= 1 && r.json.missed >= 1 && r.json.outboundConnected >= 1, JSON.stringify(r.json && { in: r.json.inboundAnswered, missed: r.json.missed, out: r.json.outboundConnected }));
check("the phone-provider webhook refuses calls without its secret", (await fetch(`${AD}/api/v1/calls/webhooks/exotel?CallSid=x&CallFrom=9000000011`)).status === 403);

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
