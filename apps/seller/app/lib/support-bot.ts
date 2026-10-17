import { createDatabase, payouts, productReviews, products, qcIssues, qcSubmissions, sellerAadhaar, sellerBankAccounts, sellerDocuments, sellerVerifications, sellers, unpaidSettlementLines } from "@azadimart/database";
import { kw, rupees, shortDate, type BotIntent, type BotQuickReply, type BotReply, type BotTool, type SupportBotSetup } from "@azadimart/notify/support-bot";
import { COMMISSION_RATE_BPS, PAYOUT_HOLD_DAYS, commissionFreeUntil, supportCategoriesFor } from "@azadimart/shared";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { loadSellerAttention } from "./seller-attention";

type Db = ReturnType<typeof createDatabase>;

const MENU: BotQuickReply[] = [
  { label: "My payments", intent: "payouts" },
  { label: "KYC & documents", intent: "kyc" },
  { label: "Products & QC", intent: "products" },
  { label: "Orders to ship", intent: "orders" },
  { label: "Ads", intent: "ads" },
  { label: "Talk to support", intent: "human" },
];

const SELLER_STATUS: Record<string, string> = {
  REGISTERED: "registered; KYC not started",
  KYC_PENDING: "waiting for your KYC",
  KYC_SUBMITTED: "KYC submitted; our team is reviewing it",
  PENDING_APPROVAL: "KYC submitted; our team is reviewing it",
  ACTIVE: "approved and active",
  REJECTED: "KYC needs changes",
  SUSPENDED: "suspended",
};
const DOC_LABEL: Record<string, string> = { PAN: "PAN card", BANK_PROOF: "Bank proof (cancelled cheque or statement)", ADDRESS_PROOF: "Address proof", GST: "GST certificate", GST_ENROLMENT: "GST Enrolment ID proof", IDENTITY: "Identity proof" };

async function kycFacts(db: Db, sellerId: string) {
  const [seller, docs, review, aadhaar, bank] = await Promise.all([
    db.select({ status: sellers.status, taxType: sellers.taxIdentityType, pan: sellers.pan, approvedAt: sellers.approvedAt, holdReason: sellers.payoutHoldReason }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
    db.select({ type: sellerDocuments.type }).from(sellerDocuments).where(eq(sellerDocuments.sellerId, sellerId)),
    db.select({ status: sellerVerifications.status, notes: sellerVerifications.notes }).from(sellerVerifications).where(eq(sellerVerifications.sellerId, sellerId)).orderBy(desc(sellerVerifications.createdAt)).limit(1).then((r) => r[0] ?? null),
    db.select({ status: sellerAadhaar.status }).from(sellerAadhaar).where(eq(sellerAadhaar.sellerId, sellerId)).limit(1).then((r) => r[0]?.status ?? null),
    db.select({ status: sellerBankAccounts.verificationStatus, last4: sellerBankAccounts.accountNumberLast4, rejectionReason: sellerBankAccounts.rejectionReason }).from(sellerBankAccounts).where(and(eq(sellerBankAccounts.sellerId, sellerId), eq(sellerBankAccounts.isPrimary, true))).limit(1).then((r) => r[0] ?? null),
  ]);
  const have = new Set(docs.map((d) => d.type));
  const needed = ["PAN", "BANK_PROOF", "ADDRESS_PROOF", seller?.taxType === "ENROLMENT_ID" ? "GST_ENROLMENT" : "GST"];
  const missing = needed.filter((t) => !have.has(t as never)).map((t) => DOC_LABEL[t] ?? t);
  return { seller, missing, review, aadhaarVerified: aadhaar === "VERIFIED", bank };
}

async function payoutFacts(db: Db, sellerId: string) {
  const [seller, lines, recent] = await Promise.all([
    db.select({ approvedAt: sellers.approvedAt, holdReason: sellers.payoutHoldReason }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
    unpaidSettlementLines(db, { sellerId }),
    db.select({ status: payouts.status, amountPaise: payouts.amountPaise, paidAt: payouts.paidAt, utr: payouts.utr, failureReason: payouts.failureReason, createdAt: payouts.createdAt }).from(payouts).where(eq(payouts.sellerId, sellerId)).orderBy(desc(payouts.createdAt)).limit(5),
  ]);
  const ready = lines.filter((l) => !l.openReturn);
  const next = ready.map((l) => l.eligibleAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const freeUntil = seller?.approvedAt ? commissionFreeUntil(seller.approvedAt) : null;
  return {
    upcomingPaise: ready.reduce((s, l) => s + l.breakdown.netPaise, 0),
    heldByReturnsPaise: lines.filter((l) => l.openReturn).reduce((s, l) => s + l.breakdown.netPaise, 0),
    nextPayoutAt: next, holdReason: seller?.holdReason ?? null,
    commissionFree: !freeUntil || freeUntil.getTime() > Date.now(), freeUntil,
    lastPaid: recent.find((p) => p.status === "PAID") ?? null,
    failed: recent.find((p) => p.status === "FAILED") ?? null,
  };
}

async function productFacts(db: Db, sellerId: string) {
  const counts = await db.select({ status: products.status, n: count() }).from(products).where(eq(products.sellerId, sellerId)).groupBy(products.status);
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>;
  const rejected = await db.select({ id: products.id, title: products.title }).from(products).where(and(eq(products.sellerId, sellerId), eq(products.status, "QC_REJECTED"))).limit(3);
  const issues = rejected.length ? await db.select({ productId: qcSubmissions.productId, description: qcIssues.description, notes: qcSubmissions.notes })
    .from(qcSubmissions).leftJoin(qcIssues, eq(qcIssues.qcSubmissionId, qcSubmissions.id))
    .where(and(inArray(qcSubmissions.productId, rejected.map((r) => r.id)), eq(qcSubmissions.status, "REJECTED"))).orderBy(desc(qcSubmissions.createdAt)).limit(10) : [];
  return {
    live: by.LIVE ?? 0, inReview: (by.PENDING_QC ?? 0) + (by.PENDING_ADMIN_APPROVAL ?? 0), needsChanges: by.QC_REJECTED ?? 0, drafts: by.DRAFT ?? 0,
    rejected: rejected.map((r) => ({ ...r, reasons: [...new Set(issues.filter((i) => i.productId === r.id).map((i) => i.description || i.notes).filter(Boolean))].slice(0, 3) as string[] })),
  };
}

export function sellerBot(sellerId: string): SupportBotSetup {
  const db = createDatabase();

  const intents: BotIntent[] = [
    {
      id: "human",
      match: kw("human", "person", "agent", "executive", "support team", "talk to", "speak to", "call me", "complaint", "escalate", "baat"),
      run: async () => ({ text: "Sure. Choose a topic and describe the problem. Our seller support team replies in Help & support (and you'll get an alert), usually within a day.", handoff: { category: "OTHER", subject: "" } }),
    },
    {
      id: "bank_change",
      match: kw("change bank", "bank change", "update bank", "new bank", "bank account change", "wrong bank", "ifsc"),
      run: async () => {
        const { bank } = await kycFacts(db, sellerId);
        return {
          text: `${bank ? `Your payouts go to the account ending ${bank.last4} (${bank.status === "VERIFIED" ? "verified" : bank.status === "REJECTED" ? "rejected" : "being verified"}). ` : ""}You can submit a new bank account in Payments; payouts pause until our team verifies it. If you need help with the change, our team can assist.`,
          links: [{ label: "Payments", href: "/payouts" }],
          handoff: { category: "SELLER_PAYMENTS", subject: "Change payout bank account" },
        };
      },
    },
    {
      id: "payouts",
      match: kw("payout", "payment", "paid", "settlement", "money", "earning", "commission", "tcs", "tds", "fee", "fees", "deduction", "utr", "paisa", "bank"),
      run: async () => {
        const f = await payoutFacts(db, sellerId);
        const lines = [
          f.holdReason ? `⚠️ Payouts are on hold: ${f.holdReason}.` : null,
          `Ready to be paid: ${rupees(f.upcomingPaise)}${f.nextPayoutAt ? ` (next payout from ${shortDate(f.nextPayoutAt)})` : ""}.`,
          f.heldByReturnsPaise ? `${rupees(f.heldByReturnsPaise)} is waiting on open returns.` : null,
          f.lastPaid ? `Last payout: ${rupees(f.lastPaid.amountPaise)} on ${shortDate(f.lastPaid.paidAt ?? f.lastPaid.createdAt)}${f.lastPaid.utr ? ` (UTR ${f.lastPaid.utr})` : ""}.` : "No payouts sent yet.",
          f.failed ? `A recent payout failed${f.failed.failureReason ? `: ${f.failed.failureReason}` : ""}. Check your bank details.` : null,
          `Each order is paid automatically ${PAYOUT_HOLD_DAYS} days after delivery. ${f.commissionFree ? `Commission is free${f.freeUntil ? ` until ${shortDate(f.freeUntil)}` : " for your first 3 months"}` : `Commission is ${COMMISSION_RATE_BPS / 100}% + 18% GST`}; TCS 0.5% and TDS 0.1% are deducted as required by law.`,
        ].filter(Boolean);
        return { text: lines.join(" "), links: [{ label: "Open Payments", href: "/payouts" }], quick: [{ label: "Payout missing or wrong", intent: "payout_issue" }, { label: "Change bank account", intent: "bank_change" }] };
      },
    },
    {
      id: "payout_issue",
      run: async () => ({ text: "Sorry about that. Please share the order number or payout date and what you expected; our team will check the settlement and reply here.", handoff: { category: "SELLER_PAYMENTS", subject: "Payout missing or incorrect" } }),
    },
    {
      id: "kyc",
      match: kw("kyc", "document", "documents", "aadhaar", "aadhar", "pan", "gst", "gstin", "enrolment", "verification", "verify", "account approved", "account approval", "kyc rejected"),
      run: async () => {
        const { seller, missing, review, aadhaarVerified, bank } = await kycFacts(db, sellerId);
        const parts = [
          `Your account is ${SELLER_STATUS[seller?.status ?? ""] ?? "being set up"}.`,
          aadhaarVerified ? "Aadhaar is verified." : "Aadhaar OTP verification is still needed.",
          missing.length ? `Still to upload: ${missing.join(", ")}.` : "All required documents are uploaded.",
          bank ? `Bank account ending ${bank.last4}: ${bank.status === "VERIFIED" ? "verified" : bank.status === "REJECTED" ? `rejected${bank.rejectionReason ? ` (${bank.rejectionReason})` : ""}` : "being verified"}.` : "No bank account added yet.",
          review?.status === "REJECTED" && review.notes ? `Our team's note: “${review.notes}”.` : null,
        ].filter(Boolean);
        return { text: parts.join(" "), links: [{ label: "Open KYC", href: "/kyc" }], quick: [{ label: "Why is KYC taking long?", intent: "kyc_wait" }, { label: "Talk to support", intent: "kyc_help" }] };
      },
    },
    {
      id: "kyc_wait",
      run: async () => ({ text: "Our team usually reviews KYC within 1–2 working days of submission. Make sure every document is clear, matches your PAN name, and the bank proof shows the account number and IFSC. You'll get an alert when it's reviewed.", links: [{ label: "Open KYC", href: "/kyc" }], quick: [{ label: "Talk to support", intent: "kyc_help" }] }),
    },
    {
      id: "kyc_help",
      run: async () => ({ text: "Tell us what's wrong with your KYC and our team will help.", handoff: { category: "SELLER_KYC", subject: "Help with KYC" } }),
    },
    {
      id: "products",
      match: kw("product", "products", "listing", "list", "qc", "quality", "catalog", "photo", "image", "sent back", "not live", "a+", "aplus", "stock", "inventory", "rejected", "approval"),
      run: async () => {
        const f = await productFacts(db, sellerId);
        const text = `You have ${f.live} live product${f.live === 1 ? "" : "s"}, ${f.inReview} in review and ${f.needsChanges} sent back for changes${f.drafts ? `, plus ${f.drafts} draft${f.drafts === 1 ? "" : "s"}` : ""}. Products are checked within 1–2 working days.` +
          (f.rejected.length ? " Sent back:" + f.rejected.map((r) => ` “${r.title}”${r.reasons.length ? ` (${r.reasons.join("; ")})` : ""}`).join(",") + ". Fix them and resubmit from Products." : "");
        return { text, links: [{ label: "Open Products", href: "/products" }], quick: [{ label: "Photo rules", intent: "photos" }, { label: "Talk to support", intent: "products_help" }] };
      },
    },
    {
      id: "photos",
      run: async () => ({ text: "Use square (1:1) photos, at least 1000 × 1000 px, on a clean background, without watermarks, phone numbers or other website names. Add up to 8 photos and one video; the first photo is the cover." }),
    },
    {
      id: "products_help",
      run: async () => ({ text: "Which product is it about, and what's the problem? Our team will take a look.", handoff: { category: "SELLER_PRODUCTS", subject: "Help with a product listing" } }),
    },
    {
      id: "orders",
      match: kw("order", "orders", "ship", "shipping", "pickup", "courier", "dispatch", "awb", "label", "late", "cancel", "return", "returns", "rto"),
      run: async () => {
        const a = await loadSellerAttention(db, sellerId);
        return {
          text: `${a?.toShip ? `${a.toShip} order${a.toShip === 1 ? "" : "s"} waiting to be packed and shipped.` : "No orders are waiting to ship right now."} Ship new orders within 1–2 days: open the order, pack it and book the courier pickup. Late orders may be cancelled automatically, and customers can cancel until you pack.`,
          links: [{ label: "Open Orders", href: "/orders" }, { label: "Pickup address", href: "/shipping" }],
          quick: [{ label: "Courier or pickup problem", intent: "orders_help" }],
        };
      },
    },
    {
      id: "orders_help",
      run: async () => ({ text: "Tell us the order number and what's happening (pickup missed, wrong weight, return dispute…). Our team will follow up.", handoff: { category: "SELLER_ORDERS", subject: "Order or shipping problem" } }),
    },
    {
      id: "ads",
      match: kw("ad", "ads", "advert", "sponsored", "banner", "bid", "promotion", "promote"),
      run: async () => ({ text: "In Ads you can book the home page banner, the Sponsored picks row, or the top spot in search and categories, per day. Bid for a day or Book now; each ad is approved by our team. Charges (+18% GST) are taken from your payouts.", links: [{ label: "Open Ads", href: "/ads" }], quick: [{ label: "Talk to support", intent: "ads_help" }] }),
    },
    {
      id: "ads_help",
      run: async () => ({ text: "What do you need help with on ads?", handoff: { category: "SELLER_ADS", subject: "Help with ads" } }),
    },
    {
      id: "reviews",
      match: kw("review", "reviews", "rating", "ratings", "feedback"),
      run: async () => {
        const [row] = await db.select({ n: count() }).from(productReviews).innerJoin(products, eq(products.id, productReviews.productId)).where(eq(products.sellerId, sellerId));
        return { text: `Your products have ${Number(row?.n ?? 0)} customer review${Number(row?.n ?? 0) === 1 ? "" : "s"}. You can reply to each one publicly from Reviews; replies help win trust. To report an abusive review, contact our team.`, links: [{ label: "Open Reviews", href: "/reviews" }] };
      },
    },
    {
      id: "menu",
      match: kw("hi", "hello", "hey", "namaste", "help", "menu", "start"),
      run: async () => ({ text: "Hi! I'm the LOIMART seller assistant. What can I help with?", quick: MENU }),
    },
  ];
  const MATCH_ORDER = ["human", "bank_change", "kyc", "payouts", "ads", "reviews", "products", "orders", "menu"];
  intents.sort((x, y) => (MATCH_ORDER.indexOf(x.id) + 1 || 99) - (MATCH_ORDER.indexOf(y.id) + 1 || 99));

  const tools: BotTool[] = [
    { name: "get_payout_summary", description: "The seller's money: amount ready to be paid, next payout date, holds, last payout, commission status.", input: { type: "object", properties: {} }, run: async () => ({ data: await payoutFacts(db, sellerId), reply: { links: [{ label: "Payments", href: "/payouts" }] } }) },
    { name: "get_kyc_status", description: "The seller's account and KYC status: Aadhaar, missing documents, bank verification and reviewer notes.", input: { type: "object", properties: {} }, run: async () => { const f = await kycFacts(db, sellerId); return { data: { status: SELLER_STATUS[f.seller?.status ?? ""], missingDocuments: f.missing, aadhaarVerified: f.aadhaarVerified, bank: f.bank, reviewerNote: f.review?.notes ?? null, payoutHold: f.seller?.holdReason ?? null }, reply: { links: [{ label: "KYC", href: "/kyc" }] } }; } },
    { name: "get_product_status", description: "Counts of live / in review / sent-back products, and why products were sent back by quality check.", input: { type: "object", properties: {} }, run: async () => ({ data: await productFacts(db, sellerId), reply: { links: [{ label: "Products", href: "/products" }] } }) },
    { name: "get_orders_attention", description: "Orders waiting to ship, products low on stock and other things needing the seller's attention.", input: { type: "object", properties: {} }, run: async () => ({ data: await loadSellerAttention(db, sellerId), reply: { links: [{ label: "Orders", href: "/orders" }] } }) },
  ];

  return {
    intents,
    fallback: async (): Promise<BotReply> => ({ text: "I'm not sure I understood. Pick a topic, or ask in a few words, like “when is my next payout” or “why was my product rejected”.", quick: MENU }),
    ai: {
      tools,
      handoffCategories: supportCategoriesFor("SELLER"),
      system: `You are the LOIMART seller assistant, helping sellers on LOIMART (an Indian marketplace) with payouts, KYC and documents, product listings and quality check, orders and shipping, and ads.
Be brief (2–4 short sentences), practical and friendly. Reply in the user's language (English, Hindi or Hinglish). Always use the tools for the seller's own data; never guess numbers.
Facts:
- Payouts are automatic, ${PAYOUT_HOLD_DAYS} days after delivery, to the verified bank account. Commission is free for the first 3 months after approval, then ${COMMISSION_RATE_BPS / 100}% + 18% GST per order. TCS 0.5% (GST) and TDS 0.1% (income tax) are deducted by law. Ad charges are deducted from payouts.
- KYC: Aadhaar OTP, PAN, bank proof, address proof, and GSTIN or a free GST Enrolment ID (Enrolment ID sellers can sell only within their state). Review takes 1–2 working days.
- Products: square 1:1 photos, min 1000×1000 px, clean background; quality check in 1–2 working days; sent-back products show the reasons and can be resubmitted.
- Orders: ship within 1–2 days; customers can cancel until the order is packed.
Changing a bank account after approval, disputes, and anything you can't solve need a person: call offer_human_handoff.`,
    },
  };
}
