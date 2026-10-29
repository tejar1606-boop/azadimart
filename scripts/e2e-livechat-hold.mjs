// End-to-end test for putting a live chat on hold: the agent parks a chat while
// waiting on the seller/courier/team, the shopper sees it's on hold and that it
// stays open, it doesn't count toward the agent's limit or time out, both sides
// can still write, and resuming tells the shopper. A chat left on hold too long,
// or whose shopper has gone by the time the agent is back, becomes a support
// request. Requires the demo seed and the storefront + admin apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… ADMIN_URL=… pnpm e2e:livechat-hold
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((x) => x.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
await sql`delete from rate_limit_buckets where key like '%liveChat%' or key like 'login:%' or key like 'ip:%'`;
const admin = client(AD), shop = client(SF);
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
const [adminUser] = await sql`select id from users where email = 'demo.admin@azadimart.test'`;

const created = { chats: new Set(), tickets: new Set() };
async function tidy() {
  await sql`delete from live_chat_agents where user_id = ${adminUser.id}`;
  for (const id of created.chats) { const [c] = await sql`select ticket_id from live_chats where id = ${id}`; if (c?.ticket_id) created.tickets.add(c.ticket_id); await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from live_chats where id = ${id}`; }
  for (const id of created.tickets) { await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from support_tickets where id = ${id}`; }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

await sql`update live_chats set status = 'ENDED', ended_at = now(), end_reason = 'ABANDONED' where status <> 'ENDED'`;
await sql`update live_chat_agents set status = 'OFFLINE'`;
const consoleNow = async () => { await sleep(1100); return (await admin("/api/v1/live-chat")).json; };
const view = async (id) => (await shop(`/api/v1/live-chat/${id}?after=0`)).json;

// --- a chat comes to the agent
await admin("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE", maxChats: 1 } });
let r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "ORDER", message: `Can I exchange size ${RUN}?`, page: "/" } });
const chat = r.json?.chatId; created.chats.add(chat);
let con = await consoleNow();
check("the chat is assigned to the agent", con?.mine?.some((c) => c.id === chat), JSON.stringify(con?.mine?.map((c) => c.id)));

// --- put on hold
check("a made-up reason is refused", (await admin(`/api/v1/live-chat/chats/${chat}/hold`, { method: "POST", body: { reason: "LUNCH" } })).status === 400);
r = await admin(`/api/v1/live-chat/chats/${chat}/hold`, { method: "POST", body: { reason: "SELLER", note: `asked seller ${RUN}` } });
check("the agent puts the chat on hold", r.status === 200, JSON.stringify(r.json));
check("…only once", (await admin(`/api/v1/live-chat/chats/${chat}/hold`, { method: "POST", body: { reason: "SELLER" } })).status === 409);
let v = await view(chat);
check("the shopper sees it's on hold and why", v?.chat?.status === "ACTIVE" && v.chat.onHold === true && v.chat.holdLabel === "Checking with the seller", JSON.stringify(v?.chat));
check("…and is told it stays open", v?.messages?.some((m) => m.author === "SYSTEM" && /chat is on hold: checking with the seller/.test(m.body)));
con = await consoleNow();
const heldRow = con?.held?.find((c) => c.id === chat);
check("the console lists it under On hold, not My chats", Boolean(heldRow) && !con.mine.some((c) => c.id === chat) && heldRow.hold?.reason === "SELLER" && heldRow.hold?.note?.includes(RUN));
check("it no longer counts toward the agent's limit", con?.me?.active === 0 && con.agents.find((a) => a.userId === adminUser.id)?.active === 0);
const h = (await admin(`/api/v1/live-chat/chats/${chat}?context=1`)).json;
check("the open chat shows the hold to the agent", h?.chat?.hold?.label === "Checking with the seller");

// --- a second chat can now come in (limit 1)
r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "ORDER", message: "x" } });
check("…so a new chat isn't started for the same shopper (their held chat is still open)", r.json?.chatId === chat);

// --- doesn't time out; both sides can write
await sql`update live_chats set requester_seen_at = now() - interval '2 hours' where id = ${chat}`;
await consoleNow();
const [still] = await sql`select status from live_chats where id = ${chat}`;
check("a chat on hold doesn't time out while the shopper is away", still?.status === "ACTIVE", still?.status);
r = await shop(`/api/v1/live-chat/${chat}/messages`, { method: "POST", body: { body: `Any news ${RUN}?` } });
check("the shopper can still write while on hold", r.status === 201, String(r.status));
con = await consoleNow();
check("…and the agent sees it as unread", con?.held?.find((c) => c.id === chat)?.unread >= 1);
r = await admin(`/api/v1/live-chat/chats/${chat}/messages`, { method: "POST", body: { body: "Still checking, thanks for waiting." } });
check("the agent can send an update while on hold", r.status === 201);

// --- resume
r = await admin(`/api/v1/live-chat/chats/${chat}/resume`, { method: "POST" });
check("the agent resumes the chat", r.status === 200, JSON.stringify(r.json));
v = await view(chat);
check("the shopper sees the agent is back", v?.chat?.onHold === false && v.messages.some((m) => m.author === "SYSTEM" && /is back with you/.test(m.body)));
con = await consoleNow();
check("it's back in My chats", con?.mine?.some((c) => c.id === chat) && !con.held.some((c) => c.id === chat));
check("resuming twice is refused", (await admin(`/api/v1/live-chat/chats/${chat}/resume`, { method: "POST" })).status === 409);
const [seen] = await sql`select hold_reason from live_chats where id = ${chat}`;
check("once the shopper has seen it, it's an ordinary chat again", seen?.hold_reason === null);

// --- on hold too long becomes a support request
await admin(`/api/v1/live-chat/chats/${chat}/hold`, { method: "POST", body: { reason: "COURIER" } });
await sql`update live_chats set held_at = now() - interval '49 hours' where id = ${chat}`;
await consoleNow();
const [late] = await sql`select status, end_reason, ticket_id from live_chats where id = ${chat}`;
if (late?.ticket_id) created.tickets.add(late.ticket_id);
check("a chat on hold for over 48 hours becomes a support request", late?.status === "ENDED" && late.end_reason === "TICKET" && Boolean(late.ticket_id), JSON.stringify(late));
const [t1] = late?.ticket_id ? await sql`select body from support_tickets where id = ${late.ticket_id}` : [];
check("…saying why", /on hold for over 48 hours \(checking with the courier\)/.test(t1?.body ?? ""), t1?.body);

// --- resumed, but the shopper had gone: a support request, not lost
r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "RETURN", message: `Refund status ${RUN}` } });
const chat2 = r.json?.chatId; created.chats.add(chat2);
await consoleNow();
await admin(`/api/v1/live-chat/chats/${chat2}/hold`, { method: "POST", body: { reason: "TEAM" } });
await admin(`/api/v1/live-chat/chats/${chat2}/resume`, { method: "POST" });
await admin(`/api/v1/live-chat/chats/${chat2}/messages`, { method: "POST", body: { body: "Your refund was sent today." } });
await sql`update live_chats set requester_seen_at = now() - interval '20 minutes' where id = ${chat2}`;
await consoleNow();
const [gone] = await sql`select status, end_reason, ticket_id from live_chats where id = ${chat2}`;
if (gone?.ticket_id) created.tickets.add(gone.ticket_id);
check("if the shopper left before the agent came back, it becomes a support request", gone?.end_reason === "TICKET" && Boolean(gone.ticket_id), JSON.stringify(gone));

// --- an ordinary chat still times out as before
r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "OTHER", message: "hello" } });
const chat3 = r.json?.chatId; created.chats.add(chat3);
await consoleNow();
await sql`update live_chats set requester_seen_at = now() - interval '20 minutes' where id = ${chat3}`;
await consoleNow();
const [idle] = await sql`select end_reason from live_chats where id = ${chat3}`;
check("an ordinary chat still times out as before", idle?.end_reason === "IDLE", idle?.end_reason);

await tidy();
const [left] = await sql`select count(*)::int n from live_chats where id = any(${[...created.chats]})`;
check("test data cleaned up", left.n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
