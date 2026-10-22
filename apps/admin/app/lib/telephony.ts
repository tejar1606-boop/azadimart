import { testProvidersAllowed } from "@azadimart/shared";

/**
 * The phone line behind the Call Centre. In India calls must go through a
 * licensed provider; LOIMART uses Exotel (TELEPHONY_PROVIDER=exotel with the
 * EXOTEL_* keys). Until then the "test" provider simulates calls on test
 * servers only; nothing rings a real phone.
 */
export type Telephony = {
  name: "test" | "exotel";
  businessNumber: string | null;
  /** Rings the agent's softphone, then connects the customer (customer sees the LOIMART number). */
  placeCall(input: { agentId: string | null; to: string; callId: string; statusCallbackUrl: string }): Promise<{ providerCallId: string }>;
};

const testLine: Telephony = {
  name: "test",
  businessNumber: "08000000000",
  async placeCall({ callId }) { return { providerCallId: "test_" + callId }; },
};

/** Exotel "connect two numbers" API: agent (softphone SIP user / number) first, then the customer, with recording. */
function exotel(): Telephony | null {
  const { EXOTEL_SID: sid, EXOTEL_API_KEY: key, EXOTEL_API_TOKEN: token, EXOTEL_CALLER_ID: callerId } = process.env;
  const host = process.env.EXOTEL_SUBDOMAIN || "api.exotel.com";
  if (!sid || !key || !token || !callerId) return null;
  return {
    name: "exotel",
    businessNumber: callerId,
    async placeCall({ agentId, to, callId, statusCallbackUrl }) {
      if (!agentId) throw new Error("Your softphone isn't set up with the phone provider yet. Ask an admin to add your Exotel agent ID.");
      const body = new URLSearchParams({ From: agentId, To: "0" + to, CallerId: callerId, Record: "true", StatusCallback: statusCallbackUrl, CustomField: callId });
      const res = await fetch(`https://${host}/v1/Accounts/${encodeURIComponent(sid)}/Calls/connect.json`, {
        method: "POST", body, headers: { Authorization: "Basic " + Buffer.from(`${key}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      });
      const json = (await res.json().catch(() => null)) as { Call?: { Sid?: string }; RestException?: { Message?: string } } | null;
      if (!res.ok || !json?.Call?.Sid) throw new Error(json?.RestException?.Message ?? `The phone provider refused the call (${res.status})`);
      return { providerCallId: json.Call.Sid };
    },
  };
}

/** The configured line, or null when calling isn't set up (never the test line on the live site). */
export function telephony(): Telephony | null {
  if (process.env.TELEPHONY_PROVIDER === "exotel") return exotel();
  return testProvidersAllowed() ? testLine : null;
}
export const statusCallbackUrl = (request: Request) => {
  const base = (process.env.AUTH_URL_ADMIN || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/api/v1/calls/webhooks/exotel?token=${encodeURIComponent(process.env.TELEPHONY_WEBHOOK_TOKEN ?? "")}`;
};
