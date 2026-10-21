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

/** Where sellers pay wallet top-ups (shown on their Wallet page). Bank account and/or UPI ID. */
const blank = (v: unknown) => (typeof v === "string" ? v.trim() : v);
export const walletPaymentDetailsSchema = z.object({
  accountName: z.preprocess(blank, z.string().max(100).default("")),
  bankName: z.preprocess(blank, z.string().max(80).default("")),
  accountNumber: z.preprocess(blank, z.string().regex(/^(\d{6,20})?$/, "Account number: 6 to 20 digits").default("")),
  ifsc: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.string().regex(/^([A-Z]{4}0[A-Z0-9]{6})?$/, "IFSC looks like SBIN0001234").default("")),
  upiId: z.preprocess(blank, z.string().regex(/^([\w.-]{2,}@[a-zA-Z]{2,})?$/, "UPI ID looks like loimart@okicici").default("")),
  note: z.preprocess(blank, z.string().max(300).default("")),
}).refine((v) => (v.accountNumber && v.ifsc && v.accountName) || v.upiId, "Add the bank account (name, number and IFSC) or a UPI ID")
  .refine((v) => !v.accountNumber || Boolean(v.ifsc && v.accountName), "Add the account holder name and IFSC with the account number");
export type WalletPaymentDetails = z.infer<typeof walletPaymentDetailsSchema>;
export const WALLET_PAYMENT_DETAILS_KEY = "wallet_payment_details";
