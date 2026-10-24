import { createDatabase, orderItems, orders, payments } from "@azadimart/database";
import { kw, rupees, shortDate, type BotCard, type BotIntent, type BotQuickReply, type BotReply, type BotTool, type SupportBotSetup } from "@azadimart/notify/support-bot";
import { supportCategoriesFor } from "@azadimart/shared";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { GET as catalogProducts } from "../api/v1/catalog/products/route";

type Db = ReturnType<typeof createDatabase>;
const RETURN_DAYS = Number(process.env.RETURN_WINDOW_DAYS ?? 7) || 7;

const MENU: BotQuickReply[] = [
  { label: "Track my order", intent: "track" },
  { label: "Cancel an order", intent: "cancel" },
  { label: "Return or refund", intent: "return" },
  { label: "Payment problem", intent: "payment" },
  { label: "Find a product", intent: "product" },
  { label: "Talk to a person", intent: "human" },
];

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate"; say: string }> = {
  CREATED: { label: "Placed", tone: "amber", say: "has been placed" },
  PAYMENT_PENDING: { label: "Waiting for payment", tone: "amber", say: "is waiting for payment" },
  PAID: { label: "Placed", tone: "amber", say: "is placed and paid" },
  CONFIRMED: { label: "Confirmed", tone: "amber", say: "is confirmed; the seller is preparing it" },
  PACKED: { label: "Packed", tone: "amber", say: "is packed and waiting for the courier" },
  SHIPPED: { label: "Shipped", tone: "green", say: "has shipped and is on its way" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "green", say: "is out for delivery today" },
  DELIVERED: { label: "Delivered", tone: "green", say: "was delivered" },
  CANCELLED: { label: "Cancelled", tone: "red", say: "was cancelled" },
  RETURNED: { label: "Returned", tone: "slate", say: "was returned" },
};

/** The customer's recent orders, newest first, with the first item's name. */
async function recentOrders(db: Db, customerId: string, limit = 5, orderNumber?: string) {
  const rows = await db.select({ id: orders.id, number: orders.orderNumber, status: orders.status, total: orders.grandTotalPaise, createdAt: orders.createdAt, deliveredAt: orders.deliveredAt, paymentMethod: payments.provider, paymentStatus: payments.status })
    .from(orders).leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(eq(orders.customerId, customerId), orderNumber ? ilike(orders.orderNumber, `%${orderNumber}%`) : undefined))
    .orderBy(desc(orders.createdAt)).limit(limit);
  const items = rows.length ? await db.select({ orderId: orderItems.orderId, title: orderItems.title, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id))) : [];
  return rows.map((r) => {
    const lines = items.filter((i) => i.orderId === r.id);
    const first = lines[0]?.title ?? "Your order";
    return { ...r, title: lines.length > 1 ? `${first} and ${lines.length - 1} more` : first };
  });
}
type OrderRow = Awaited<ReturnType<typeof recentOrders>>[number];

const orderCard = (o: OrderRow): BotCard => ({
  kind: "order", title: o.title, subtitle: `${o.number} · ${rupees(o.total)} · ${shortDate(o.createdAt)}`,
  status: STATUS[o.status]?.label ?? o.status, tone: STATUS[o.status]?.tone ?? "slate", href: `/account/orders/${o.id}`,
});

/** "AZM-20261010-B0D7FCBAAE" or its last part, if the message contains one. */
const orderNumberIn = (text: string) => text.toUpperCase().match(/AZM-\d{8}-[0-9A-F]{6,}|\b[0-9A-F]{10}\b/)?.[0];

const SIGN_IN: BotReply = { text: "Please sign in so I can see your orders. I'll be right here when you come back.", signIn: true, quick: [{ label: "Return policy", intent: "return" }, { label: "Payment options", intent: "payment" }] };

async function productCards(request: Request, query: string) {
  const res = await catalogProducts(new Request(new URL(`/api/v1/catalog/products?limit=4&q=${encodeURIComponent(query)}`, request.url)));
  const items = ((await res.json()) as { items?: Array<{ id: string; slug: string; title: string; sellerName?: string; variants?: Array<{ pricePaise: number; availableQuantity?: number }>; media?: Array<{ storageKey: string; kind: string }> }> }).items ?? [];
  return items.map((p) => {
    const price = p.variants?.[0]?.pricePaise;
    const inStock = (p.variants ?? []).some((v) => (v.availableQuantity ?? 1) > 0);
    const image = p.media?.find((m) => m.kind === "IMAGE")?.storageKey;
    return { id: p.id, title: p.title, price, inStock, seller: p.sellerName ?? "", card: { kind: "product" as const, title: p.title, subtitle: `${price != null ? rupees(price) : ""}${inStock ? "" : " · Out of stock"}${p.sellerName ? ` · ${p.sellerName}` : ""}`, image: image ? `/media/${image}` : null, href: `/products/${p.slug}` } };
  });
}

/** Words that are only "how do I ask" noise, removed before a product search. */
const SEARCH_NOISE = /\b(do you have|have you got|is there|i want|i need|looking for|find|search|show me|price of|price|cost|buy|kya|hai|chahiye|available|in stock|product|products|please|pls|the|a|an|for|me)\b/gi;

export function customerBot(request: Request, who: { customerId: string | null }): SupportBotSetup {
  const db = createDatabase();
  const signedIn = Boolean(who.customerId);

  const intents: BotIntent[] = [
    {
      id: "human",
      match: kw("human", "person", "agent", "executive", "customer care", "talk to", "speak to", "call me", "complaint", "complain", "baat"),
      run: async () => signedIn
        ? { text: "Sure. Tell us what happened and our support team will reply here and in My account → Help & support, usually within a day.", handoff: { category: "OTHER", subject: "" } }
        : { text: "Our support team can help. Please sign in first, so they can see your orders and reply to you.", signIn: true },
    },
    {
      id: "track",
      match: kw("track", "where is my", "where's my", "status", "deliver", "delivery", "shipped", "arrive", "late", "delay", "kab", "kaha", "order"),
      run: async (message) => {
        if (!who.customerId) return SIGN_IN;
        const number = orderNumberIn(message);
        const list = await recentOrders(db, who.customerId, number ? 1 : 3, number);
        if (!list.length) return { text: number ? `I couldn't find order ${number} on your account. Check the number in your order confirmation, or see all your orders.` : "You don't have any orders yet. When you place one, you can track it here.", links: [{ label: "My orders", href: "/account/orders" }], quick: MENU.slice(0, 3) };
        const latest = list[0]!;
        const extra = latest.status === "DELIVERED" && latest.deliveredAt ? ` on ${shortDate(latest.deliveredAt)}` : "";
        return {
          text: `Your latest order (${latest.title}) ${STATUS[latest.status]?.say ?? "is being processed"}${extra}. Tap an order for full tracking.`,
          cards: list.map(orderCard),
          quick: [{ label: "It's late or missing", intent: "late" }, { label: "Cancel an order", intent: "cancel" }, { label: "Something else", intent: "menu" }],
        };
      },
    },
    {
      id: "late",
      match: kw("not received", "not delivered", "missing", "never arrived", "nahi aaya", "nahi mila"),
      run: async () => {
        if (!who.customerId) return SIGN_IN;
        const list = (await recentOrders(db, who.customerId, 5)).filter((o) => ["CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status));
        return {
          text: "Sorry about that. Most orders arrive within 3–7 days of shipping. If an order shows Delivered but you didn't get it, or it's been stuck for more than 2 days, our team will check with the courier.",
          cards: list.slice(0, 3).map(orderCard),
          handoff: { category: "ORDER", subject: "Order late or not received", orderId: list[0]?.id ?? null },
        };
      },
    },
    {
      id: "cancel",
      match: kw("cancel", "cancellation", "radd"),
      run: async () => {
        const base = "You can cancel an order yourself while it's Confirmed, before the seller packs it: open the order and tap Cancel order. Once it's packed or shipped it can't be cancelled, but you can refuse delivery or return it after delivery.";
        if (!who.customerId) return { ...SIGN_IN, text: base + " Sign in to see your orders." };
        const open = (await recentOrders(db, who.customerId, 10)).filter((o) => o.status === "CONFIRMED");
        return { text: open.length ? base + " These orders can still be cancelled:" : base, cards: open.slice(0, 3).map(orderCard), links: open.length ? [] : [{ label: "My orders", href: "/account/orders" }], quick: [{ label: "Refund timeline", intent: "refund" }, { label: "Talk to a person", intent: "human" }] };
      },
    },
    {
      id: "return",
      match: kw("return", "exchange", "replace", "replacement", "damaged", "broken", "defective", "wrong item", "wrong product", "size issue", "doesn't fit", "wapas", "kharab"),
      run: async () => {
        const text = `You can return eligible items within ${RETURN_DAYS} days of delivery. Open the delivered order, tap Return items, choose the items and the reason. We arrange the pickup, and the refund starts once the seller receives the item.`;
        if (!who.customerId) return { text: text + " Sign in to start a return.", signIn: true, quick: [{ label: "Refund timeline", intent: "refund" }] };
        const recent = (await recentOrders(db, who.customerId, 10)).filter((o) => o.status === "DELIVERED" && o.deliveredAt && Date.now() - o.deliveredAt.getTime() <= RETURN_DAYS * 864e5);
        return {
          text: recent.length ? text + " These delivered orders are still in the return window:" : text,
          cards: recent.slice(0, 3).map(orderCard),
          quick: [{ label: "Refund timeline", intent: "refund" }, { label: "Item damaged or wrong", intent: "damaged" }],
        };
      },
    },
    {
      id: "damaged",
      run: async () => {
        if (!who.customerId) return SIGN_IN;
        const recent = (await recentOrders(db, who.customerId, 5)).filter((o) => o.status === "DELIVERED");
        return { text: "We're sorry. Please start a return from the order page and pick “Damaged” or “Wrong item” as the reason, with a photo if you can. If you'd rather, our team can look into it for you.", cards: recent.slice(0, 3).map(orderCard), handoff: { category: "RETURN", subject: "Damaged or wrong item received", orderId: recent[0]?.id ?? null } };
      },
    },
    {
      id: "refund",
      match: kw("refund", "money back", "paisa wapas", "paise wapas", "refunded"),
      run: async () => ({
        text: "Refunds go back to your original payment method: usually 5–7 working days after the return is received, or after a prepaid order is cancelled (UPI is often faster). Cash on Delivery orders that are cancelled have nothing to pay. You can see the refund status on the order page.",
        links: signedIn ? [{ label: "My orders", href: "/account/orders" }] : [],
        quick: [{ label: "Refund not received", intent: "refund_late" }, { label: "Start a return", intent: "return" }],
      }),
    },
    {
      id: "refund_late",
      run: async () => {
        if (!who.customerId) return SIGN_IN;
        const list = (await recentOrders(db, who.customerId, 10)).filter((o) => o.status === "CANCELLED" || o.status === "RETURNED" || o.paymentStatus === "REFUNDED" || o.paymentStatus === "PARTIALLY_REFUNDED");
        return { text: "If it's been more than 7 working days, our team will trace it with the payment provider and share the reference number.", cards: list.slice(0, 3).map(orderCard), handoff: { category: "RETURN", subject: "Refund not received", orderId: list[0]?.id ?? null } };
      },
    },
    {
      id: "payment",
      match: kw("payment", "pay", "paid", "upi", "card", "debit", "deducted", "failed", "transaction", "cod", "cash on delivery", "emi", "net banking", "kat gaya", "kata", "paisa"),
      run: async (message) => {
        const deducted = /deduct|debited|\bcut\b|kat gaya|kata|failed|charged/i.test(message);
        if (deducted) {
          return {
            text: "If money was deducted but the order didn't go through, don't worry: banks usually reverse it automatically within 5–7 working days. If it doesn't come back, or you were charged twice, our team will check it with the payment provider.",
            handoff: signedIn ? { category: "PAYMENT", subject: "Money deducted but order failed" } : undefined,
            signIn: !signedIn || undefined,
          };
        }
        return { text: "You can pay online securely (UPI, cards, net banking) or choose Cash on Delivery, available across India. Your order total is shown at checkout before you pay.", quick: [{ label: "Money deducted, no order", intent: "payment_failed" }, { label: "Refund timeline", intent: "refund" }] };
      },
    },
    {
      id: "payment_failed",
      run: async () => ({
        text: "Banks usually reverse a failed payment within 5–7 working days. If it doesn't come back, or you were charged twice, our team will check it with the payment provider. Please keep the UPI or bank reference handy.",
        ...(signedIn ? { handoff: { category: "PAYMENT", subject: "Money deducted but order failed" } } : { signIn: true }),
      }),
    },
    {
      id: "account",
      match: kw("password", "login", "log in", "sign in", "account", "otp", "email", "phone number", "address"),
      run: async () => ({
        text: signedIn ? "You can manage your addresses and see your orders in My account. For a sign-in or account problem we can't fix here, our team can help." : "You can sign in or create an account from the top of the page. If you can't get in, our team can help once you share your registered email.",
        links: [{ label: signedIn ? "My account" : "Sign in", href: signedIn ? "/account" : "/login" }],
        quick: [{ label: "Talk to a person", intent: "human" }],
      }),
    },
    {
      id: "seller",
      match: kw("sell on", "become a seller", "seller registration", "register as seller", "start selling"),
      run: async () => ({ text: "Great! You can register as a seller in a few minutes. You'll need your PAN, bank details, and a GSTIN or free GST Enrolment ID.", links: [{ label: "Register as a seller", href: (process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.loimart.com") + "/register" }] }),
    },
    {
      id: "product",
      match: kw("do you have", "is there", "looking for", "price of", "in stock", "available", "size", "colour", "color", "chahiye", "product"),
      run: async (message) => {
        const query = message.replace(SEARCH_NOISE, " ").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
        if (!query) return { text: "What are you looking for? Type the product name, like “cotton kurta” or “power bank”." };
        const found = await productCards(request, query);
        if (!found.length) return { text: `I couldn't find “${query}” right now. Try a shorter name, or browse all products.`, links: [{ label: "All products", href: "/products" }] };
        return { text: `Here's what I found for “${query}”. Tap a product for photos, sizes and delivery details.`, cards: found.map((f) => f.card), links: [{ label: "See all results", href: `/products?q=${encodeURIComponent(query)}` }] };
      },
    },
    {
      id: "menu",
      match: kw("hi", "hello", "hey", "namaste", "help", "menu", "start"),
      run: async () => ({ text: "Hi! I'm the LOIMART assistant. How can I help you today?", quick: MENU }),
    },
  ];

  const tools: BotTool[] = [
    {
      name: "get_my_orders",
      description: "The signed-in customer's recent orders with status, total and items. Optionally filter by order number.",
      input: { type: "object", properties: { orderNumber: { type: "string" }, limit: { type: "number" } } },
      run: async (input) => {
        if (!who.customerId) return { data: { signedIn: false, note: "Ask the user to sign in to see orders." }, reply: { signIn: true } };
        const list = await recentOrders(db, who.customerId, Math.min(10, Number(input.limit) || 5), typeof input.orderNumber === "string" ? input.orderNumber : undefined);
        return {
          data: list.map((o) => ({ orderId: o.id, number: o.number, items: o.title, status: STATUS[o.status]?.label ?? o.status, total: rupees(o.total), placed: shortDate(o.createdAt), delivered: o.deliveredAt ? shortDate(o.deliveredAt) : null, payment: o.paymentMethod === "COD" ? "Cash on Delivery" : "Paid online", paymentStatus: o.paymentStatus, canCancel: o.status === "CONFIRMED", canReturn: o.status === "DELIVERED" && !!o.deliveredAt && Date.now() - o.deliveredAt.getTime() <= RETURN_DAYS * 864e5 })),
          reply: { cards: list.slice(0, 3).map(orderCard) },
        };
      },
    },
    {
      name: "search_products",
      description: "Search live products on LOIMART by name or type. Returns title, price, stock and seller.",
      input: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      run: async (input) => {
        const found = await productCards(request, String(input.query ?? "").slice(0, 80));
        return { data: found.map((f) => ({ title: f.title, price: f.price != null ? rupees(f.price) : null, inStock: f.inStock, seller: f.seller })), reply: { cards: found.map((f) => f.card) } };
      },
    },
  ];

  // Typed messages match the first topic in this order: specific problems before general words like "order".
  const MATCH_ORDER = ["human", "late", "cancel", "refund", "return", "payment", "account", "seller", "track", "product", "menu"];
  intents.sort((x, y) => (MATCH_ORDER.indexOf(x.id) + 1 || 99) - (MATCH_ORDER.indexOf(y.id) + 1 || 99));

  return {
    intents,
    fallback: async () => ({ text: "I'm not sure I understood. Choose a topic below, or type your question in a few words, like “where is my order” or “return a kurta”.", quick: MENU }),
    ai: {
      tools,
      handoffCategories: supportCategoriesFor("CUSTOMER"),
      system: `You are the LOIMART help assistant, for shoppers on LOIMART, an Indian online marketplace of KYC-verified Indian sellers.
Be warm, brief (2–4 short sentences) and practical. Reply in the user's language (English, Hindi or Hinglish). Never invent order details: use get_my_orders. Use search_products for product questions.
${signedIn ? "The user is signed in." : "The user is NOT signed in; ask them to sign in for anything about their orders."}
Facts:
- Cancel: the customer can cancel on the order page only while the order is Confirmed (before it's packed).
- Returns: within ${RETURN_DAYS} days of delivery, from the order page (Return items). Pickup is arranged; refund starts once the seller receives it.
- Refunds go to the original payment method, usually 5–7 working days. Cancelled Cash on Delivery orders have nothing to pay.
- Payment: online (UPI, cards, net banking) or Cash on Delivery across India. Failed payments that were deducted are usually reversed by the bank in 5–7 working days.
- Every seller is KYC-verified and products are quality-checked.
Don't promise things outside these facts (no compensation, no exact delivery dates). When a person is needed, call offer_human_handoff; the user then confirms and writes their message.`,
    },
  };
}
