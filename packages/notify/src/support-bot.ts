/**
 * The LOIMART help assistant. Each app (storefront, seller portal) gives it
 * "intents": topics with keywords and a handler that looks up live data. It
 * works without any AI service. When ANTHROPIC_API_KEY is set, typed
 * questions go to Claude instead, which can call the same lookups as tools;
 * if that fails for any reason, the guided answers are used.
 */

export type BotLink = { label: string; href: string };
export type BotQuickReply = { label: string; intent: string };
export type BotCard =
  | { kind: "order"; title: string; subtitle: string; status: string; tone: "green" | "amber" | "red" | "slate"; href: string }
  | { kind: "product"; title: string; subtitle: string; image?: string | null; href: string };
export type BotHandoff = { category: string; subject: string; orderId?: string | null; productId?: string | null };
export type BotReply = { text: string; links?: BotLink[]; quick?: BotQuickReply[]; cards?: BotCard[]; handoff?: BotHandoff; signIn?: boolean };

export type BotIntent = {
  id: string;
  /** Matches typed messages (English and common Hinglish words). */
  match?: RegExp;
  run: (message: string) => Promise<BotReply>;
};

/** A lookup the AI may call. `reply` parts (cards, links) are shown under the AI's answer. */
export type BotTool = {
  name: string;
  description: string;
  input: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (input: Record<string, unknown>) => Promise<{ data: unknown; reply?: Omit<BotReply, "text"> }>;
};

export type SupportBotSetup = {
  intents: BotIntent[];
  /** Answer when nothing matches. */
  fallback: (message: string) => Promise<BotReply>;
  ai?: { system: string; tools: BotTool[]; handoffCategories: string[] };
};

/** Builds a case-insensitive whole-word matcher: kw("refund", "paisa wapas"). */
export const kw = (...words: string[]) => new RegExp(`(^|[^a-z])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function answerSupport(setup: SupportBotSetup, input: { message: string; intent: string; history: Array<{ role: "user" | "assistant"; content: string }> }): Promise<{ reply: BotReply; engine: "GUIDED" | "AI" }> {
  // Buttons are exact topics: answer them directly (fast and free).
  if (input.intent) {
    const intent = setup.intents.find((i) => i.id === input.intent);
    if (intent) return { reply: await intent.run(input.message), engine: "GUIDED" };
  }
  if (setup.ai && aiEnabled() && input.message) {
    try {
      return { reply: await askClaude(setup.ai, input.history, input.message), engine: "AI" };
    } catch {
      /* fall back to guided answers below */
    }
  }
  const matched = setup.intents.find((i) => i.match?.test(input.message));
  return { reply: await (matched ? matched.run(input.message) : setup.fallback(input.message)), engine: "GUIDED" };
}

type ClaudeBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ClaudeMessage = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };

async function askClaude(ai: NonNullable<SupportBotSetup["ai"]>, history: Array<{ role: "user" | "assistant"; content: string }>, message: string): Promise<BotReply> {
  const handoffTool: BotTool = {
    name: "offer_human_handoff",
    description: "Offer to pass the conversation to a person in the LOIMART support team. Use when the problem needs a human (refund disputes, damaged items, payment taken but no order, bank or KYC changes, anything you can't solve), or when the user asks for a person.",
    input: { type: "object", properties: { category: { type: "string", enum: ai.handoffCategories }, subject: { type: "string", description: "Short subject for the ticket, under 80 characters" }, orderId: { type: "string", description: "Order id (uuid) if the problem is about one order" } }, required: ["category", "subject"] },
    run: async (input) => ({ data: { offered: true }, reply: { handoff: { category: String(input.category), subject: String(input.subject).slice(0, 120), orderId: typeof input.orderId === "string" && /^[0-9a-f-]{36}$/i.test(input.orderId) ? input.orderId : null } } }),
  };
  const tools = [...ai.tools, handoffTool];
  const extras: Omit<BotReply, "text"> = {};
  // Keep the last turns only; old context costs money and rarely helps.
  const messages: ClaudeMessage[] = [...history.slice(-12).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];
  while (messages[0]?.role === "assistant") messages.shift();

  for (let round = 0; round < 5; round++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.SUPPORT_AI_MODEL || "claude-haiku-5-5",
        max_tokens: 800,
        system: ai.system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input })),
        messages,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`AI ${response.status}`);
    const body = (await response.json()) as { content: ClaudeBlock[]; stop_reason: string };
    const uses = body.content.filter((b): b is Extract<ClaudeBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (body.stop_reason !== "tool_use" || !uses.length) {
      const text = body.content.filter((b): b is Extract<ClaudeBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();
      if (!text) throw new Error("AI gave no answer");
      return { text, ...extras };
    }
    messages.push({ role: "assistant", content: body.content as unknown as Array<Record<string, unknown>> });
    const results = [];
    for (const use of uses) {
      const tool = tools.find((t) => t.name === use.name);
      let content: string;
      try {
        const out = tool ? await tool.run(use.input ?? {}) : { data: { error: "Unknown tool" } };
        if (out.reply?.cards) extras.cards = [...(extras.cards ?? []), ...out.reply.cards].slice(0, 6);
        if (out.reply?.links) extras.links = [...(extras.links ?? []), ...out.reply.links].slice(0, 4);
        if (out.reply?.handoff) extras.handoff = out.reply.handoff;
        if (out.reply?.signIn) extras.signIn = true;
        content = JSON.stringify(out.data).slice(0, 8000);
      } catch {
        content = JSON.stringify({ error: "Lookup failed" });
      }
      results.push({ type: "tool_result", tool_use_id: use.id, content });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("AI took too many steps");
}

/** "₹1,299" */
export const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: paise % 100 ? 2 : 0 });
/** "12 Oct" (India time) */
export const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
