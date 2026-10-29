// End-to-end test for help & support: the customer and seller help chat
// (guided answers from live data, sign-in prompts, hand-off), tickets with the
// chat attached, privacy of internal notes, the admin support desk (queue,
// search, reply, notes, assign, priority, resolve, close), unread flags,
// ratings, seller alerts, support agents (limited access, switch off), saved
// replies and access rules. Requires the demo seed and an E2E seller
// (pnpm e2e:seller), all three apps, and a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:support
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, redirect = "follow" } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, location: res.headers.get("location") };
  };
}
const guest = client(SF), shop = client(SF), admin = client(AD), seller = client(SE), rival = client(SE), agent = client(AD);
const [rivalUser] = await sql`select u.email from sellers s join users u on u.id = s.user_id where s.status = 'ACTIVE' and u.email like 'e2e.seller.%' order by s.created_at desc limit 1`;
if (!rivalUser) throw new Error("Run pnpm e2e:seller first (needs an active E2E seller).");
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await rival("/api/auth/login", { method: "POST", body: { email: rivalUser.email, password: PW } });
const [customer] = await sql`select c.id, c.user_id from customers c join users u on u.id = c.user_id where u.email = 'demo.customer@azadimart.test'`;
const [me] = await sql`select s.id, s.store_name from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [myOrder] = await sql`select id, order_number from orders where customer_id = ${customer.id} order by created_at desc limit 1`;
const [otherOrder] = await sql`select id from orders where customer_id <> ${customer.id} limit 1`;

const tickets = [], chats = [], canned = [], createdRoles = [];
let agentUserId = null;
async function tidy() {
  for (const id of tickets) {
    await sql`delete from seller_notifications where href = ${"/help/tickets/" + id}`;
    await sql`delete from audit_logs where entity_id = ${id}`;
    await sql`update support_chats set ticket_id = null where ticket_id = ${id}`;
    await sql`delete from support_tickets where id = ${id}`;
  }
  for (const id of chats) await sql`delete from support_chats where id = ${id}`;
  for (const id of canned) { await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from support_canned_replies where id = ${id}`; }
  if (agentUserId) {
    await sql`delete from audit_logs where actor_user_id = ${agentUserId} or entity_id = ${agentUserId}`;
    await sql`delete from users where id = ${agentUserId}`;
  }
  for (const id of createdRoles) { await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from roles where id = ${id}`; }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

const chat = async (c, body) => { const r = await c("/api/v1/support/chat", { method: "POST", body }); if (r.json?.chatId && !chats.includes(r.json.chatId)) chats.push(r.json.chatId); return r; };

// --- customer help chat
let r = await chat(guest, { intent: "menu" });
check("guest gets a greeting with topics", r.status === 200 && /assistant/i.test(r.json.reply.text) && r.json.reply.quick?.length >= 4, String(r.status));
r = await chat(guest, { message: "where is my order" });
check("guest asking about orders is asked to sign in", r.json?.reply?.signIn === true && !(r.json.reply.cards ?? []).length);
r = await chat(shop, { message: "where is my order?" });
let chatId = r.json?.chatId;
check("signed-in customer sees their own orders", (r.json?.reply?.cards ?? []).length > 0 && r.json.reply.cards.every((c) => c.href.startsWith("/account/orders/")), r.json?.reply?.text);
const ownIds = new Set((await sql`select id from orders where customer_id = ${customer.id}`).map((o) => o.id));
check("order cards are only the customer's orders", (r.json?.reply?.cards ?? []).every((c) => ownIds.has(c.href.split("/").pop())));
r = await chat(shop, { chatId, message: `status of ${myOrder.order_number}` });
check("finds an order by its number", (r.json?.reply?.cards ?? []).length === 1 && r.json.reply.cards[0].subtitle.includes(myOrder.order_number));
r = await chat(shop, { chatId, message: "I want to cancel my order" });
check("cancel question answered with the cancel rule", /Confirmed/.test(r.json?.reply?.text ?? ""));
r = await chat(shop, { chatId, message: "paisa kat gaya but order failed" });
check("money deducted → payment answer with hand-off", r.json?.reply?.handoff?.category === "PAYMENT", r.json?.reply?.text);
r = await chat(shop, { chatId, message: "do you have cricket bat" });
check("product question shows product cards", (r.json?.reply?.cards ?? []).some((c) => c.kind === "product" && c.href.startsWith("/products/")));
r = await chat(shop, { chatId, message: "return policy" });
check("return question explains the 7-day window", /7 days/.test(r.json?.reply?.text ?? ""));
const [savedChat] = await sql`select customer_id, jsonb_array_length(messages) n, engine from support_chats where id = ${chatId}`;
check("chat is saved to the customer", savedChat?.customer_id === customer.id && savedChat.n === 12, JSON.stringify(savedChat));
check("guest can't continue a customer's chat", ((await chat(guest, { chatId, message: "hi" })).json?.chatId ?? chatId) !== chatId);

// --- customer opens a ticket from the chat
r = await shop("/api/v1/support/tickets", { method: "POST", body: { category: "PAYMENT", subject: `E2E payment ${RUN}`, message: "Money deducted, no order", orderId: myOrder.id, chatId } });
const ticket = r.json?.ticket;
if (ticket) tickets.push(ticket.id);
check("customer opens a ticket", r.status === 201 && ticket.number >= 1001, String(r.status));
const [row] = await sql`select priority, channel, staff_unread, status, requester_type, order_id from support_tickets where id = ${ticket.id}`;
check("payment tickets start as High priority, via chat", row.priority === "HIGH" && row.channel === "CHAT" && row.staff_unread && row.status === "OPEN" && row.requester_type === "CUSTOMER");
check("the chat is attached for the team", (await sql`select count(*)::int n from support_messages where ticket_id = ${ticket.id} and is_internal and author_type = 'SYSTEM' and message like 'Help chat before this ticket%'`)[0].n === 1);
check("can't attach someone else's order", (await shop("/api/v1/support/tickets", { method: "POST", body: { category: "ORDER", subject: "Not mine", message: "x", orderId: otherOrder.id } })).status === 404);
check("customers can't use seller topics", (await shop("/api/v1/support/tickets", { method: "POST", body: { category: "SELLER_KYC", subject: "Wrong topic", message: "x" } })).status === 400);
check("guests can't open tickets", [401, 403].includes((await guest("/api/v1/support/tickets", { method: "POST", body: { category: "ORDER", subject: "Guest", message: "x" } })).status));
let view = (await shop(`/api/v1/support/tickets/${ticket.id}`)).json;
check("customer sees their message but not the internal chat copy", view?.messages?.length === 1 && view.messages[0].authorType === "REQUESTER");
check("ticket listed for the customer", ((await shop("/api/v1/support/tickets")).json?.items ?? []).some((t) => t.id === ticket.id));

// --- support desk
let desk = (await admin("/api/v1/support/tickets?view=open")).json;
check("ticket in the desk queue, with stats", desk?.items?.some((t) => t.id === ticket.id && t.requesterName && t.staffUnread) && desk.stats.open >= 1);
check("search by #number", ((await admin(`/api/v1/support/tickets?view=all&q=%23${ticket.number}`)).json?.items ?? []).map((t) => t.id).join() === ticket.id);
check("filter by requester type", !((await admin("/api/v1/support/tickets?view=all&type=SELLER")).json?.items ?? []).some((t) => t.id === ticket.id));
let full = (await admin(`/api/v1/support/tickets/${ticket.id}`)).json;
check("desk shows customer, their orders and the linked order", full?.context?.kind === "CUSTOMER" && full.context.recentOrders.length > 0 && full.order?.number === myOrder.order_number);
check("desk sees the attached chat", full?.messages?.some((m) => m.isInternal && m.authorType === "SYSTEM"));
check("opening clears the desk's 'new' flag", (await sql`select staff_unread from support_tickets where id = ${ticket.id}`)[0].staff_unread === false);
await admin(`/api/v1/support/tickets/${ticket.id}`, { method: "POST", body: { message: "Checking with the bank", internal: true } });
view = (await shop(`/api/v1/support/tickets/${ticket.id}`)).json;
check("internal notes stay hidden from the customer", view.messages.length === 1 && !(await sql`select requester_unread from support_tickets where id = ${ticket.id}`)[0].requester_unread);
r = await admin(`/api/v1/support/tickets/${ticket.id}`, { method: "POST", body: { message: `Hi, we're on it ${RUN}` } });
const [afterReply] = await sql`select status, first_response_at, requester_unread, last_reply_by, assigned_to_user_id from support_tickets where id = ${ticket.id}`;
check("reply waits on the customer, records first response, self-assigns", r.status === 201 && afterReply.status === "WAITING" && afterReply.first_response_at && afterReply.requester_unread && afterReply.last_reply_by === "STAFF" && afterReply.assigned_to_user_id);
check("customer has 1 unread reply", (await shop("/api/v1/support/unread")).json?.count >= 1);
view = (await shop(`/api/v1/support/tickets/${ticket.id}`)).json;
check("customer sees the reply (and it's marked read)", view.messages.some((m) => m.authorType === "STAFF" && m.message.includes(RUN)) && (await sql`select requester_unread from support_tickets where id = ${ticket.id}`)[0].requester_unread === false);
await shop(`/api/v1/support/tickets/${ticket.id}`, { method: "POST", body: { message: "UTR is 1234" } });
const [afterCustomer] = await sql`select status, staff_unread, last_reply_by from support_tickets where id = ${ticket.id}`;
check("customer reply puts it back in the queue", afterCustomer.status === "OPEN" && afterCustomer.staff_unread && afterCustomer.last_reply_by === "REQUESTER");
check("priority and assignee can be changed", (await admin(`/api/v1/support/tickets/${ticket.id}`, { method: "PATCH", body: { priority: "URGENT", assignedToUserId: null } })).json?.ticket?.priority === "URGENT");
check("can only assign to the support team", (await admin(`/api/v1/support/tickets/${ticket.id}`, { method: "PATCH", body: { assignedToUserId: customer.user_id } })).status === 400);
r = await admin(`/api/v1/support/tickets/${ticket.id}`, { method: "PATCH", body: { status: "RESOLVED" } });
check("desk resolves; customer is told", r.json?.ticket?.status === "RESOLVED" && ((await shop(`/api/v1/support/tickets/${ticket.id}`)).json?.messages ?? []).some((m) => m.authorType === "SYSTEM"));
r = await shop(`/api/v1/support/tickets/${ticket.id}`, { method: "PATCH", body: { rating: 5, ratingNote: "Quick help" } });
check("customer rates the help", r.json?.ticket?.rating === 5);
await shop(`/api/v1/support/tickets/${ticket.id}`, { method: "POST", body: { message: "Actually one more thing" } });
check("replying to a resolved ticket reopens it", (await sql`select status, resolved_at from support_tickets where id = ${ticket.id}`)[0].status === "OPEN");
await admin(`/api/v1/support/tickets/${ticket.id}`, { method: "PATCH", body: { status: "CLOSED" } });
check("closed tickets take no more replies", (await shop(`/api/v1/support/tickets/${ticket.id}`, { method: "POST", body: { message: "hello?" } })).status === 409);
r = await shop("/api/v1/support/tickets", { method: "POST", body: { category: "ORDER", subject: `E2E order ${RUN}`, message: "Where is it" } });
if (r.json?.ticket) tickets.push(r.json.ticket.id);
await shop(`/api/v1/support/tickets/${r.json.ticket.id}`, { method: "PATCH", body: { status: "RESOLVED" } });
check("customer can mark their own ticket solved", (await sql`select status from support_tickets where id = ${r.json.ticket.id}`)[0].status === "RESOLVED");

// --- seller help chat and tickets
r = await chat(seller, { message: "when is my next payout?" });
check("seller payout answer from their data", /Ready to be paid/.test(r.json?.reply?.text ?? "") && r.json.reply.links?.some((l) => l.href === "/payouts"), r.json?.reply?.text);
r = await chat(seller, { message: "kyc documents status" });
check("seller KYC answer", /Aadhaar/.test(r.json?.reply?.text ?? "") && r.json.reply.links?.some((l) => l.href === "/kyc"));
r = await chat(seller, { message: "why was my product rejected in qc" });
check("seller product/QC answer", /live product/.test(r.json?.reply?.text ?? ""));
r = await chat(seller, { message: "I need to change bank account" });
check("bank change offers a hand-off", r.json?.reply?.handoff?.category === "SELLER_PAYMENTS");
check("customers can't use the seller chat", [401, 403].includes((await shop(`${SE}/api/v1/support/chat`, { method: "POST", body: { message: "payout" } })).status));
r = await seller("/api/v1/support/tickets", { method: "POST", body: { category: "SELLER_KYC", subject: `E2E KYC ${RUN}`, message: "My PAN was rejected", chatId: r.json?.chatId } });
const sTicket = r.json?.ticket;
if (sTicket) tickets.push(sTicket.id);
check("seller opens a KYC ticket (High priority)", r.status === 201 && (await sql`select priority, seller_id from support_tickets where id = ${sTicket.id}`)[0].priority === "HIGH");
check("sellers can't use customer topics", (await seller("/api/v1/support/tickets", { method: "POST", body: { category: "RETURN", subject: "Wrong", message: "x" } })).status === 400);
check("another seller can't open it", (await rival(`/api/v1/support/tickets/${sTicket.id}`)).status === 404);
check("a customer can't open a seller's ticket", (await shop(`/api/v1/support/tickets/${sTicket.id}`)).status === 404);
full = (await admin(`/api/v1/support/tickets/${sTicket.id}`)).json;
check("desk shows seller KYC context", full?.context?.kind === "SELLER" && full.context.seller?.storeName === me.store_name && "aadhaarVerified" in full.context);
await admin(`/api/v1/support/tickets/${sTicket.id}`, { method: "POST", body: { message: `Please upload a clearer PAN ${RUN}` } });
const sAlerts = ((await seller("/api/v1/notifications")).json?.items ?? []).filter((n) => n.kind === "SUPPORT_REPLY");
check("seller gets a support-reply alert linking to the ticket", sAlerts.some((n) => n.href === `/help/tickets/${sTicket.id}`));
check("seller unread count", (await seller("/api/v1/support/unread")).json?.count >= 1);

// --- support agents and saved replies
const agentEmail = `e2e.agent.${RUN.toLowerCase()}@azadimart.test`;
// Its own support-only role: ready-made roles may have been edited by the team.
const supportRole = (await admin("/api/v1/team/roles", { method: "POST", body: { name: `E2E Support ${RUN}`, permissions: ["support"] } })).json?.role;
if (supportRole?.id) createdRoles.push(supportRole.id);
r = await admin("/api/v1/team/members", { method: "POST", body: { displayName: `Agent ${RUN}`, email: agentEmail, password: "AgentPass2026!", roleId: supportRole?.id } });
agentUserId = r.json?.member?.userId ?? null;
check("admin adds a support agent", r.status === 201 && agentUserId);
check("agent signs in to the admin portal", (await agent("/api/auth/login", { method: "POST", body: { email: agentEmail, password: "AgentPass2026!" } })).status === 200);
check("agent works the desk", (await agent("/api/v1/support/tickets")).status === 200);
check("agent can't use other admin tools", (await agent("/api/v1/coupons")).status === 403 && (await agent("/api/v1/orders")).status === 403);
check("agent can't add agents", (await agent("/api/v1/team/members", { method: "POST", body: { displayName: "Nope", email: "nope@azadimart.test", password: "AgentPass2026!", roleId: supportRole?.id } })).status === 403);
r = await agent(`/api/v1/support/tickets/${sTicket.id}`, { method: "PATCH", body: { assignedToUserId: agentUserId } });
check("ticket assigned to the agent", r.json?.ticket?.assignedToUserId === agentUserId);
r = await agent(`/api/v1/support/tickets/${sTicket.id}`, { method: "POST", body: { message: "Agent here, looking now" } });
check("agent's reply shows their name", r.json?.messages?.some((m) => m.authorType === "STAFF" && m.author === `Agent ${RUN}`));
r = await agent("/api/v1/support/canned", { method: "POST", body: { title: `E2E reply ${RUN}`, body: "Hi {name}, thanks!" } });
if (r.json?.reply?.id) canned.push(r.json.reply.id);
check("saved replies can be added", r.status === 201 && ((await admin(`/api/v1/support/tickets/${sTicket.id}`)).json?.canned ?? []).some((c) => c.id === r.json.reply.id));
await admin(`/api/v1/team/members/${agentUserId}`, { method: "PATCH", body: { isActive: false } });
check("switching an agent off signs them out and frees their tickets", [401, 403].includes((await agent("/api/v1/support/tickets")).status) && !(await sql`select assigned_to_user_id from support_tickets where id = ${sTicket.id}`)[0].assigned_to_user_id);
check("customers and sellers can't reach the desk", [401, 403].includes((await shop(`${AD}/api/v1/support/tickets`)).status) && [401, 403].includes((await seller(`${AD}/api/v1/support/tickets`)).status));
const audits = await sql`select action from audit_logs where created_at > now() - interval '15 minutes' and action like 'SUPPORT_%'`;
check("adding and switching off agents is audited", (await sql`select count(*)::int n from audit_logs where entity_id = ${agentUserId} and action in ('TEAM_MEMBER_ADDED', 'TEAM_MEMBER_UPDATED')`)[0].n === 2);
check("support actions audited", ["SUPPORT_REPLY", "SUPPORT_NOTE", "SUPPORT_TICKET_UPDATED"].every((a) => audits.some((x) => x.action === a)));
desk = (await admin("/api/v1/support/tickets?view=all")).json;
check("desk counts assistant chats", desk?.stats?.botChats7d >= 2 && desk.stats.botEscalated7d >= 2);

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
