import { afterEach, describe, expect, it } from "vitest";
import { answerSupport, kw, type SupportBotSetup } from "./support-bot";

const setup: SupportBotSetup = {
  intents: [
    { id: "cancel", match: kw("cancel"), run: async () => ({ text: "cancel answer" }) },
    { id: "track", match: kw("order", "kab"), run: async () => ({ text: "track answer" }) },
    { id: "button_only", run: async () => ({ text: "button answer" }) },
  ],
  fallback: async () => ({ text: "fallback" }),
  ai: { system: "", tools: [], handoffCategories: ["OTHER"] },
};
const ask = (message: string, intent = "") => answerSupport(setup, { message, intent, history: [] });

describe("support assistant", () => {
  afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  it("routes buttons and typed messages to topics, in order", async () => {
    expect((await ask("", "button_only")).reply.text).toBe("button answer");
    expect((await ask("please cancel my order")).reply.text).toBe("cancel answer");
    expect((await ask("order kab aayega")).reply.text).toBe("track answer");
    expect((await ask("asdf")).reply.text).toBe("fallback");
  });

  it("matches whole words only", () => {
    expect(kw("pay").test("I want to pay")).toBe(true);
    expect(kw("ad").test("I have a bad day")).toBe(false);
  });

  it("falls back to guided answers when the AI is unavailable", async () => {
    process.env.ANTHROPIC_API_KEY = "test-invalid";
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
    try {
      const out = await ask("cancel please");
      expect(out.engine).toBe("GUIDED");
      expect(out.reply.text).toBe("cancel answer");
    } finally {
      globalThis.fetch = original;
    }
  });
});
