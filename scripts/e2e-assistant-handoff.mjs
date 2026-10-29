// End-to-end test for the assistant → support team hand-over: asking for a
// person hands over at once, answers with a self-service fix only offer it
// ("soft"), the live chat carries the assistant conversation so the agent
// sees it, someone else's assistant chat can't be attached, and when nobody
// is online the request saved for the team includes the assistant chat too.
// Requires the demo seed and the storefront + admin apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… ADMIN_URL=… pnpm e2e:assistant-handoff
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toLowerCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  const c = async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base, ...(c.key ? { "x-live-chat-key": c.key } : {}) };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((x) => x.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  c.key = null;
  return c;
}
// Earlier runs (and the live chat test) use up the guest limits on this machine's IP.
await sql`delete from rate_limit_buckets where key like '%liveChat%' or key like '%supportChat%' or key like 'login:%' or key like 'ip:%'`;
const admin = client(AD), shop = client(SF), guest = client(SF);
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
const [adminUser] = await sql`select id from users where email = 'demo.admin@azadimart.test'`;

const created = { chats: new Set(), tickets: new Set(), assistant: new Set() };
async function tidy() {
  await sql`delete from live_chat_agents where user_id = ${adminUser.id}`;
  for (const id of created.chats) { const [c] = await sql`select ticket_id from live_chats where id = ${id}`; if (c?.ticket_id) created.tickets.add(c.ticket_id); await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from live_chats where id = ${id}`; }
  for (const id of created.tickets) await sql`delete from support_tickets where id = ${id}`;
  for (const id of created.assistant) await sql`delete from support_chats where id = ${id}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

await sql`update live_chats set status = 'ENDED', ended_at = now(), end_reason = 'ABANDONED' where status <> 'ENDED'`;
await sql`update live_chat_agents set status = 'OFFLINE'`;

// --- the assistant answers first
let r = await shop("/api/v1/support/chat", { method: "POST", body: { message: `My parcel ${RUN} never arrived` } });
const botChat = r.json?.chatId; created.assistant.add(botChat);
check("an answer with a self-service fix only offers the team (soft)", r.json?.reply?.handoff?.soft === true, JSON.stringify(r.json?.reply?.handoff));
r = await shop("/api/v1/support/chat", { method: "POST", body: { chatId: botChat, message: "talk to a person please", history: [{ role: "user", content: `My parcel ${RUN} never arrived` }] } });
check("asking for a person hands over straight away", Boolean(r.json?.reply?.handoff) && !r.json.reply.handoff.soft && /passing you/i.test(r.json.reply.text), r.json?.reply?.text);
check("…for guests too (no sign-in wall)", Boolean((await guest("/api/v1/support/chat", { method: "POST", body: { message: "talk to a person" } })).json?.reply?.handoff));

// --- team online: a live chat that carries the assistant conversation
await admin("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE", maxChats: 3 } });
r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "ORDER", message: `My parcel ${RUN} never arrived`, assistantChatId: botChat, page: "/" } });
const live1 = r.json?.chatId; created.chats.add(live1);
check("hand-over starts a live chat", r.status === 201 && Boolean(live1));
const [row1] = await sql`select assistant_chat_id, status from live_chats where id = ${live1}`;
check("…linked to the assistant conversation", row1?.assistant_chat_id === botChat);
const ctx = (await admin(`/api/v1/live-chat/chats/${live1}?context=1`)).json?.context;
check("the agent sees what was said to the assistant", ctx?.assistantChat?.length >= 4 && ctx.assistantChat.some((m) => m.role === "user" && m.content.includes(RUN)) && ctx.assistantChat.some((m) => m.role === "assistant"), String(ctx?.assistantChat?.length));
await admin(`/api/v1/live-chat/chats/${live1}/end`, { method: "POST" });

// --- someone else's assistant chat can't be attached
r = await guest("/api/v1/live-chat", { method: "POST", body: { name: `Guest ${RUN}`, message: "Hello", assistantChatId: botChat } });
guest.key = r.json?.token; created.chats.add(r.json?.chatId);
const [row2] = await sql`select assistant_chat_id from live_chats where id = ${r.json?.chatId}`;
check("a guest can't attach a customer's assistant chat", r.status === 201 && row2?.assistant_chat_id === null, JSON.stringify({ status: r.status, row2, err: r.json?.error }));
await guest(`/api/v1/live-chat/${r.json?.chatId}/end`, { method: "POST" });

// --- team offline: saved for the team, with the assistant chat
await sql`update live_chat_agents set status = 'OFFLINE' where user_id = ${adminUser.id}`;
r = await shop("/api/v1/live-chat");
check("shoppers see the team is offline", r.json?.online === 0);
r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "ORDER", message: `Still no parcel ${RUN}`, assistantChatId: botChat } });
const live2 = r.json?.chatId; created.chats.add(live2);
r = await shop(`/api/v1/live-chat/${live2}/leave-message`, { method: "POST", body: { message: `Still no parcel ${RUN}` } });
const ticket = r.json?.ticket; if (ticket) created.tickets.add(ticket.id);
check("offline hand-over becomes a support request", r.status === 201 && Boolean(ticket?.number));
const notes = ticket ? await sql`select message from support_messages where ticket_id = ${ticket.id} and is_internal` : [];
check("…with the assistant conversation for the team", notes.some((n) => n.message.includes("chat with the assistant first") && n.message.includes(RUN)));

await tidy();
const left = await sql`select (select count(*)::int from live_chats where id = any(${[...created.chats]})) as chats, (select count(*)::int from support_chats where id = any(${[...created.assistant]})) as bot`;
check("test data cleaned up", left[0].chats === 0 && left[0].bot === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
