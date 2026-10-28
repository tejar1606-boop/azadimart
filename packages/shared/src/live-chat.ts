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
  /** An agent counts as online while Admin (any page) has checked in this recently. Above 60 s because Chrome slows background tabs to a check a minute. */
  agentHeartbeat: 75,
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
  /** The assistant chat this was handed over from. */
  assistantChatId: z.string().uuid().nullable().optional(),
});
export const liveChatMessageSchema = z.object({ body });

const reportDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-01");
/** Admin → Live chat → Reports filters (query string). */
export const liveChatReportQuerySchema = z.object({
  from: reportDay.optional(), to: reportDay.optional(), agent: z.string().uuid().optional(),
  source: z.enum(["STOREFRONT", "SELLER"]).optional(),
  rating: z.union([z.enum(["1", "2", "3", "4", "5"]).transform(Number), z.literal("none")]).optional(),
  outcome: z.enum(["RESOLVED", "ABANDONED", "IDLE", "TICKET", "MISSED"]).optional(),
});

/** A photo or PDF sent in a live chat. Stored privately; opened through a signed, expiring link. */
export type LiveChatAttachment = { key: string; name: string; mimeType: string; size: number; kind: "IMAGE" | "DOCUMENT" };
/** Largest photo or PDF a chat accepts. */
export const LIVE_CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** Optional text sent with a file. */
export const liveChatCaptionSchema = z.string().trim().max(2000).default("");
export const liveChatRateSchema = z.object({ rating: z.number().int().min(1).max(5), note: z.string().trim().max(500).optional() });
export const liveAgentPresenceSchema = z.object({ status: z.enum(LIVE_AGENT_STATUSES), maxChats: z.number().int().min(1).max(10).optional() });
export const liveChatTransferSchema = z.object({ agentUserId: z.string().uuid() });
