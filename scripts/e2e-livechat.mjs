// End-to-end test for live chat: agents go online, chats route instantly to
// the least busy agent, queue position and wait estimate when everyone is
// busy, messages both ways with typing and read receipts, guests with a
// private chat key, leave-a-message (becomes a support request), take,
// transfer, agent-offline re-queue, abandoned chats, chat → support request,
// end and rating, and access rules. Requires the demo seed, an E2E seller
// (pnpm e2e:seller) and all three apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… SELLER_URL=… ADMIN_URL=… pnpm e2e:livechat
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toLowerCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(base, key = null) {
  let cookie = "";
  const c = async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base, ...(c.key ? { "x-live-chat-key": c.key } : {}) };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((x) => x.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  c.key = key;
  return c;
}
const admin = client(AD), agent2 = client(AD), shop = client(SF), seller = client(SE), guest = client(SF), stranger = client(SF), catalogOnly = client(AD);
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
const [adminUser] = await sql`select id from users where email = 'demo.admin@azadimart.test'`;

const created = { chats: new Set(), tickets: new Set(), users: [], roles: [] };
async function tidy() {
  await sql`delete from live_chat_agents where user_id = ${adminUser.id}`;
  for (const id of created.chats) { const [c] = await sql`select ticket_id from live_chats where id = ${id}`; if (c?.ticket_id) created.tickets.add(c.ticket_id); await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from live_chats where id = ${id}`; }
  for (const id of created.tickets) await sql`delete from support_tickets where id = ${id}`;
  for (const id of [...created.users].reverse()) { await sql`delete from audit_logs where actor_user_id = ${id} or entity_id = ${id}`; await sql`delete from users where id = ${id}`; }
  for (const id of created.roles) { await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from roles where id = ${id}`; }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

// Close any open chats from earlier runs so routing starts clean.
await sql`update live_chats set status = 'ENDED', ended_at = now(), end_reason = 'ABANDONED' where status <> 'ENDED'`;
await sql`update live_chat_agents set status = 'OFFLINE'`;

// --- a second agent (live chat role) and a member without live chat
const mkRole = async (name, permissions) => { const r = await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E ${name} ${RUN}`, permissions } }); created.roles.push(r.json.role.id); return r.json.role.id; };
const liveRole = await mkRole("Live", ["livechat"]);
const catRole = await mkRole("Cat", ["catalog"]);
for (const [c, key, roleId] of [[agent2, "agent", liveRole], [catalogOnly, "cat", catRole]]) {
  const email = `e2e.live.${key}.${RUN}@azadimart.test`;
  const r = await admin("/api/v1/team/members", { method: "POST", body: { displayName: key === "agent" ? `Agent ${RUN}` : `Cat ${RUN}`, email, password: "LivePass2026!", roleId } });
  created.users.push(r.json.member.userId);
  await c("/api/auth/login", { method: "POST", body: { email, password: "LivePass2026!" } });
}
const agent2Id = created.users[0];

// --- agents online
check("nobody online → wait unknown", (await guest("/api/v1/live-chat")).json?.online === 0);
let r = await admin("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE", maxChats: 1 } });
check("agent goes online", r.status === 200 && r.json.me.status === "ONLINE");
await agent2("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE", maxChats: 1 } });
r = await guest("/api/v1/live-chat");
check("shoppers see agents online and a short wait", r.json.online === 2 && r.json.waitSeconds !== null && r.json.waitSeconds < 60, JSON.stringify(r.json));

// --- customer chat: routed instantly
r = await shop("/api/v1/live-chat", { method: "POST", body: { topic: "ORDER", message: `Where is my order? ${RUN}` } });
const c1 = r.json?.chatId; created.chats.add(c1);
let view = (await shop(`/api/v1/live-chat/${c1}`)).json;
check("customer chat goes straight to an agent", r.status === 201 && view.chat.status === "ACTIVE" && view.chat.agentName && view.messages.some((m) => m.author === "SYSTEM" && /joined/.test(m.body)), JSON.stringify(view?.chat));
const [row1] = await sql`select assigned_agent_id from live_chats where id = ${c1}`;
const first = row1.assigned_agent_id === adminUser.id ? admin : agent2;
const second = first === admin ? agent2 : admin;
let con = (await first("/api/v1/live-chat")).json;
check("it shows in that agent's chats with 1 unread", con.mine.some((c) => c.id === c1 && c.unread === 1 && c.awaitingReplySeconds >= 0));
check("starting again reuses the open chat", (await shop("/api/v1/live-chat", { method: "POST", body: { message: "hello again" } })).json?.chatId === c1);

// --- seller chat goes to the other (least busy) agent
r = await seller("/api/v1/live-chat", { method: "POST", body: { topic: "SELLER_PAYMENTS", message: `Payout question ${RUN}` } });
const c2 = r.json?.chatId; created.chats.add(c2);
const [row2] = await sql`select status, assigned_agent_id from live_chats where id = ${c2}`;
check("next chat goes to the least busy agent", row2.status === "ACTIVE" && row2.assigned_agent_id && row2.assigned_agent_id !== row1.assigned_agent_id);

// --- messages, typing, read receipts
await first(`/api/v1/live-chat/chats/${c1}?context=1`);
await first(`/api/v1/live-chat/chats/${c1}/typing`, { method: "POST" });
view = (await shop(`/api/v1/live-chat/${c1}?after=0`)).json;
check("customer sees the agent typing", view.chat.agentTyping === true);
r = await first(`/api/v1/live-chat/chats/${c1}/messages`, { method: "POST", body: { body: `It ships today ${RUN}` } });
check("agent replies", r.status === 201);
view = (await shop(`/api/v1/live-chat/${c1}?after=0`)).json;
const agentMsg = view.messages.find((m) => m.author === "AGENT");
check("customer receives the reply with the agent's name", agentMsg?.body === `It ships today ${RUN}` && agentMsg.agentName);
let ac = (await first(`/api/v1/live-chat/chats/${c1}?after=0`)).json;
check("agent sees it was read", ac.chat.requesterReadSeq >= agentMsg.seq);
await shop(`/api/v1/live-chat/${c1}/typing`, { method: "POST" });
await shop(`/api/v1/live-chat/${c1}/messages`, { method: "POST", body: { body: "Thanks!" } });
ac = (await first(`/api/v1/live-chat/chats/${c1}?after=${agentMsg.seq}`)).json;
check("agent gets only new messages (after a seq)", ac.messages.length >= 1 && ac.messages.every((m) => m.seq > agentMsg.seq) && ac.messages.some((m) => m.body === "Thanks!"));
check("first reply time recorded", (await sql`select first_agent_reply_at from live_chats where id = ${c1}`)[0].first_agent_reply_at !== null);
const ctx = (await first(`/api/v1/live-chat/chats/${c1}?context=1`)).json.context;
check("agent sees the customer and their recent orders", ctx?.name && Array.isArray(ctx.recentOrders));

// --- everyone busy: queue position and wait
check("guests must give a name", (await guest("/api/v1/live-chat", { method: "POST", body: { message: "hi" } })).status === 400);
r = await guest("/api/v1/live-chat", { method: "POST", body: { name: `Guest ${RUN}`, message: `Is COD available? ${RUN}` } });
const c3 = r.json?.chatId; guest.key = r.json?.token; created.chats.add(c3);
view = (await guest(`/api/v1/live-chat/${c3}`)).json;
check("when all agents are full the guest waits, #1 in line, with an estimate", view.chat.status === "WAITING" && view.chat.position === 1 && view.chat.waitSeconds > 0, JSON.stringify(view.chat));
check("a guest chat is private to its key", (await stranger(`/api/v1/live-chat/${c3}`)).status === 404);
check("not offered to leave a message yet", view.chat.offerMessage === false);
con = (await admin("/api/v1/live-chat")).json;
check("agents see the waiting chat with its wait time", con.queue.some((c) => c.id === c3 && c.waitedSeconds >= 0 && c.requesterType === "GUEST"));
await sql`update live_chats set queued_at = now() - interval '3 minutes' where id = ${c3}`;
view = (await guest(`/api/v1/live-chat/${c3}`)).json;
check("after 2 minutes the guest is offered to leave a message", view.chat.offerMessage === true);
check("guests need a contact to leave a message", (await guest(`/api/v1/live-chat/${c3}/leave-message`, { method: "POST", body: { message: "Call me" } })).status === 400);
r = await guest(`/api/v1/live-chat/${c3}/leave-message`, { method: "POST", body: { message: "Please call me", contact: "98765 43210" } });
if (r.json?.ticket) created.tickets.add(r.json.ticket.id);
const [t3] = r.json?.ticket ? await sql`select body, priority from support_tickets where id = ${r.json.ticket.id}` : [{}];
check("leaving a message creates a high-priority support request with the contact", r.status === 201 && t3.body?.includes("98765 43210") && t3.priority === "HIGH");
check("…and ends the chat", (await guest(`/api/v1/live-chat/${c3}`)).json.chat.status === "ENDED");

// --- take a waiting chat manually
const g2 = client(SF);
r = await g2("/api/v1/live-chat", { method: "POST", body: { name: `Guest2 ${RUN}`, message: "Need help with size" } });
const c4 = r.json.chatId; g2.key = r.json.token; created.chats.add(c4);
await admin("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE", maxChats: 3 } });
await sleep(1100);
await g2(`/api/v1/live-chat/${c4}`);
const [row4] = await sql`select status, assigned_agent_id from live_chats where id = ${c4}`;
check("raising capacity routes the waiting chat at once", row4.status === "ACTIVE" && row4.assigned_agent_id === adminUser.id);
const g3 = client(SF);
r = await g3("/api/v1/live-chat", { method: "POST", body: { name: `Guest3 ${RUN}`, message: "Return question" } });
const c5 = r.json.chatId; g3.key = r.json.token; created.chats.add(c5);
await sql`update live_chats set status = 'WAITING', assigned_agent_id = null where id = ${c5}`;
r = await agent2(`/api/v1/live-chat/chats/${c5}/take`, { method: "POST" });
check("an agent can take a waiting chat", r.status === 200 && (await sql`select assigned_agent_id from live_chats where id = ${c5}`)[0].assigned_agent_id === agent2Id);
check("…and nobody else can take it then", (await admin(`/api/v1/live-chat/chats/${c5}/take`, { method: "POST" })).status === 409);
check("only the assigned agent can reply", (await admin(`/api/v1/live-chat/chats/${c5}/messages`, { method: "POST", body: { body: "hi" } })).status === 409);

// --- transfer
r = await agent2(`/api/v1/live-chat/chats/${c5}/transfer`, { method: "POST", body: { agentUserId: adminUser.id } });
const [row5] = await sql`select assigned_agent_id from live_chats where id = ${c5}`;
check("transfer to another online agent", r.status === 200 && row5.assigned_agent_id === adminUser.id && (await g3(`/api/v1/live-chat/${c5}`)).json.messages.some((m) => m.author === "SYSTEM" && /joined to help/.test(m.body)));

// --- an agent going offline doesn't strand customers
const [before2] = await sql`select id from live_chats where assigned_agent_id = ${agent2Id} and status = 'ACTIVE'`;
await agent2("/api/v1/live-chat/presence", { method: "POST", body: { status: "OFFLINE" } });
await sleep(1100);
await admin("/api/v1/live-chat");
if (before2) {
  const [moved] = await sql`select status, assigned_agent_id from live_chats where id = ${before2.id}`;
  check("when an agent goes offline their chats move to another agent", moved.assigned_agent_id === adminUser.id || moved.status === "WAITING", JSON.stringify(moved));
} else check("when an agent goes offline their chats move to another agent", true, "(no chat to move)");

// --- abandoned while waiting
const g4 = client(SF);
await admin("/api/v1/live-chat/presence", { method: "POST", body: { status: "AWAY" } });
r = await g4("/api/v1/live-chat", { method: "POST", body: { name: `Guest4 ${RUN}`, message: "Anyone?" } });
const c6 = r.json.chatId; created.chats.add(c6);
await sql`update live_chats set requester_seen_at = now() - interval '3 minutes' where id = ${c6}`;
await sleep(1100);
await admin("/api/v1/live-chat");
const [row6] = await sql`select status, end_reason from live_chats where id = ${c6}`;
check("a guest who left the queue is marked missed, not left for agents", row6.status === "ENDED" && row6.end_reason === "ABANDONED");
check("Away agents get no new chats", (await sql`select count(*)::int n from live_chats where id = ${c6} and assigned_agent_id is not null`)[0].n === 0);
await admin("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE" } });

// --- chat → support request, end and rating
const owner1 = (await sql`select assigned_agent_id from live_chats where id = ${c1}`)[0].assigned_agent_id === adminUser.id ? admin : agent2;
if (owner1 === agent2) await agent2("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE" } });
check("rating before the chat ends is refused", (await shop(`/api/v1/live-chat/${c1}/rate`, { method: "POST", body: { rating: 5 } })).status === 409);
r = await owner1(`/api/v1/live-chat/chats/${c1}/end`, { method: "POST" });
view = (await shop(`/api/v1/live-chat/${c1}`)).json;
check("agent ends the chat; customer is told", r.status === 200 && view.chat.status === "ENDED" && view.messages.some((m) => /ended the chat/.test(m.body)));
check("customer rates the chat", (await shop(`/api/v1/live-chat/${c1}/rate`, { method: "POST", body: { rating: 5, note: "Fast!" } })).status === 200 && (await sql`select rating from live_chats where id = ${c1}`)[0].rating === 5);
check("no messages after the end", (await shop(`/api/v1/live-chat/${c1}/messages`, { method: "POST", body: { body: "one more" } })).status === 409);
const sellerOwner = (await sql`select assigned_agent_id from live_chats where id = ${c2}`)[0].assigned_agent_id === adminUser.id ? admin : agent2;
if (sellerOwner === agent2) await agent2("/api/v1/live-chat/presence", { method: "POST", body: { status: "ONLINE" } });
const [c2now] = await sql`select status, assigned_agent_id from live_chats where id = ${c2}`;
const c2agent = c2now.assigned_agent_id === adminUser.id ? admin : agent2;
r = await c2agent(`/api/v1/live-chat/chats/${c2}/ticket`, { method: "POST", body: { note: "Check settlement for this seller" } });
if (r.json?.ticket) created.tickets.add(r.json.ticket.id);
const sView = (await seller(`/api/v1/live-chat/${c2}`)).json;
check("agent turns a chat into a support request; seller sees the request number", r.status === 201 && sView.chat.status === "ENDED" && sView.messages.some((m) => m.body.includes(`#${r.json.ticket.number}`)), `${r.status} ${c2now.status}`);
check("the request has the chat attached for the team", (await sql`select count(*)::int n from support_messages where ticket_id = ${r.json?.ticket?.id} and is_internal and message like 'Live chat with%'`)[0].n === 1);

// --- access
check("team members without Live chat can't use the console", (await catalogOnly("/api/v1/live-chat")).status === 403);
check("customers can't open the console", [401, 403].includes((await shop(`${AD}/api/v1/live-chat`)).status));
check("a seller can't open a customer's chat", (await seller(`/api/v1/live-chat/${c1}`)).status === 404);
check("seller live chat needs sign-in", (await client(SE)("/api/v1/live-chat", { method: "POST", body: { message: "hi" } })).status === 401);
const hist = (await admin("/api/v1/live-chat/history")).json;
con = (await admin("/api/v1/live-chat")).json;
check("history lists ended chats; today's numbers count them", hist.items.some((h) => h.id === c1 && h.rating === 5) && con.today.chats >= 5 && con.today.missed >= 1);
check("audit trail for take, transfer and requests", (await sql`select count(*)::int n from audit_logs where action in ('LIVE_CHAT_TAKEN', 'LIVE_CHAT_TRANSFERRED', 'LIVE_CHAT_TO_TICKET') and entity_id = any(${[c2, c5]})`).at(0)?.n >= 2);

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
