import { z } from "zod";
import { SUPPORT_CATEGORY_KEYS, type SupportCategory } from "./support";

/**
 * Live chat: shoppers and sellers talk in real time with an online support
 * agent. Separate from the help assistant (bot) and support requests
 * (tickets): a chat is routed straight to the least busy online agent, and
 * the requester always sees their place in the queue and the expected wait.
 */
export const LIVE_CHAT_STATUSES = ["WAITING", "ACTIVE", "ENDED"] as const;
export type LiveChatStatus = (typeof LIVE_CHAT_STATUSES)[number];
export const LIVE_AGENT_STATUSES = ["ONLINE", "AWAY", "OFFLINE"] as const;
export type LiveAgentStatus = (typeof LIVE_AGENT_STATUSES)[number];

/** How long things may take before the system steps in (seconds). */
export const LIVE_CHAT_TIMING = {
  /** An agent counts as online while their console has checked in this recently. */
  agentHeartbeat: 45,
  /** A waiting requester who stopped checking in this long ago has left. */
  requesterGone: 90,
  /** An active chat whose requester has been gone this long is ended. */
  requesterIdleEnd: 15 * 60,
  /** An active chat whose agent went offline this long ago goes back to the queue. */
  agentGoneRequeue: 90,
  /** After this wait the requester is offered to leave a message instead. */
  offerMessageAfter: 120,
  /** Waits above this show red in the agent console. */
  waitWarn: 60,
  /** Typing indicators fade after this. */
  typing: 6,
  /** Rough handling time per chat, used for the wait estimate. */
  avgHandle: 4 * 60,
} as const;
export const LIVE_CHAT_DEFAULT_MAX_CHATS = 3;

/** "Usually under a minute", "About 3 minutes" for the requester. */
export function liveChatWaitText(seconds: number | null): string {
  if (seconds === null) return "Our team is offline right now";
  if (seconds < 60) return "Usually under a minute";
  const m = Math.round(seconds / 60);
  return `About ${m} minute${m === 1 ? "" : "s"}`;
}

/**
 * Expected wait for a requester at a queue position (1 = next), given how
 * many chats the online agents can still take right now.
 */
export function estimateLiveWait(position: number, freeSlots: number, onlineAgents: number): number | null {
  if (onlineAgents <= 0) return null;
  if (position <= freeSlots) return 15;
  const ahead = position - freeSlots;
  return Math.round((ahead / onlineAgents) * LIVE_CHAT_TIMING.avgHandle);
}

const body = z.string().trim().min(1, "Write a message").max(2000);
export const liveChatStartSchema = z.object({
  topic: z.enum(SUPPORT_CATEGORY_KEYS as [SupportCategory, ...SupportCategory[]]).optional().default("OTHER"),
  message: body,
  /** Guests only. */
  name: z.string().trim().min(2, "Add your name").max(60).optional(),
  contact: z.string().trim().max(120).optional(),
  page: z.string().trim().max(300).optional().default(""),
});
export const liveChatMessageSchema = z.object({ body });
export const liveChatRateSchema = z.object({ rating: z.number().int().min(1).max(5), note: z.string().trim().max(500).optional() });
export const liveAgentPresenceSchema = z.object({ status: z.enum(LIVE_AGENT_STATUSES), maxChats: z.number().int().min(1).max(10).optional() });
export const liveChatTransferSchema = z.object({ agentUserId: z.string().uuid() });
