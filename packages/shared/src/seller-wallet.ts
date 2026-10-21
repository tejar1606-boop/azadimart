import { z } from "zod";

/**
 * Seller courier wallet: prepaid balance that pays LOIMART courier fees.
 * Closed loop (only LOIMART's own service, no withdrawals or transfers).
 * The balance can never go above SELLER_WALLET_MAX_PAISE (₹500).
 */
export const SELLER_WALLET_MAX_PAISE = 50_000;
export const SELLER_WALLET_MIN_TOP_UP_PAISE = 100;

export const walletTopUpRequestSchema = z.object({
  amountPaise: z.number().int().min(SELLER_WALLET_MIN_TOP_UP_PAISE, "Add at least ₹1").max(SELLER_WALLET_MAX_PAISE, "The wallet can hold up to ₹500"),
  reference: z.string().trim().min(6, "Enter the bank / UPI transaction reference (UTR)").max(40).regex(/^[A-Za-z0-9-]+$/, "Use only letters and numbers from the reference"),
});
export const walletTopUpDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).optional(),
}).refine((v) => v.decision === "APPROVE" || Boolean(v.note), "Give a reason for rejecting");

/** How much more can be added right now. */
export const walletRoomPaise = (balancePaise: number, pendingPaise = 0) => Math.max(0, SELLER_WALLET_MAX_PAISE - balancePaise - pendingPaise);
