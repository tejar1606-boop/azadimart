import { randomUUID } from "node:crypto";
import { detectChatFile } from "./chat-files";
import type { ObjectStore } from "./object-store";

/**
 * Screenshots or PDFs proving imported reviews are genuine. Private: stored under
 * review-proofs/{uploaderUserId}/ (never served by the public /media route)
 * and opened only by admins through a signed-in API.
 */
export const REVIEW_PROOF_PREFIX = "review-proofs/";
export const REVIEW_PROOF_MAX_BYTES = 10 * 1024 * 1024;

export class ReviewProofError extends Error {}

/** Checks the bytes are a JPG, PNG or WebP image or a PDF (e.g. a review export) and stores them privately. */
export async function saveReviewProof(store: ObjectStore, userId: string, bytes: Uint8Array): Promise<{ key: string; mimeType: string }> {
  if (!bytes.length || bytes.length > REVIEW_PROOF_MAX_BYTES) throw new ReviewProofError("The screenshot must be under 10 MB");
  const detected = detectChatFile(bytes);
  if (!detected) throw new ReviewProofError("Upload a screenshot (JPG, PNG, WebP) or a PDF");
  const key = `${REVIEW_PROOF_PREFIX}${userId}/${randomUUID()}.${detected.extension}`;
  await store.put(key, bytes, detected.mimeType);
  return { key, mimeType: detected.mimeType };
}
