import { randomUUID } from "node:crypto";
import { detectChatFile } from "./chat-files";
import type { ObjectStore } from "./object-store";

/**
 * Screenshots or PDFs of a payment a seller made to LOIMART (wallet top-ups).
 * Private: stored under payment-proofs/{sellerId}/ (never served by the public
 * /media route) and opened only through signed-in APIs.
 */
export const PAYMENT_PROOF_PREFIX = "payment-proofs/";
export const PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;

export class PaymentProofError extends Error {}

/** Checks the bytes are a JPG, PNG or WebP image or a PDF and stores them privately. */
export async function savePaymentProof(store: ObjectStore, sellerId: string, bytes: Uint8Array): Promise<{ key: string; mimeType: string }> {
  if (!bytes.length) throw new PaymentProofError("Attach the payment screenshot");
  if (bytes.length > PAYMENT_PROOF_MAX_BYTES) throw new PaymentProofError("The payment screenshot must be under 10 MB");
  const detected = detectChatFile(bytes);
  if (!detected) throw new PaymentProofError("Upload the payment screenshot as JPG, PNG, WebP or PDF");
  const key = `${PAYMENT_PROOF_PREFIX}${sellerId}/${randomUUID()}.${detected.extension}`;
  await store.put(key, bytes, detected.mimeType);
  return { key, mimeType: detected.mimeType };
}
