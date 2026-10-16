import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ObjectStore } from "./object-store";
import { isValidStorageKey } from "./object-store";

/**
 * Photos and PDFs sent in live chat. They are private: stored under
 * chat-files/{chatId}/ (never served by the public /media route) and opened
 * only through a link signed for the people in that chat, which expires.
 */
export type ChatFile = { key: string; name: string; mimeType: string; size: number; kind: "IMAGE" | "DOCUMENT" };
export type ChatFileView = Omit<ChatFile, "key"> & { url: string };

export const CHAT_FILE_PREFIX = "chat-files/";
const LINK_SECONDS = 7 * 24 * 60 * 60;

type Detected = { mimeType: string; extension: "jpg" | "png" | "webp" | "pdf"; kind: "IMAGE" | "DOCUMENT" };

/** Real file type from its first bytes (never the name or the browser's claim). */
export function detectChatFile(bytes: Uint8Array): Detected | null {
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return { mimeType: "application/pdf", extension: "pdf", kind: "DOCUMENT" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg", kind: "IMAGE" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return { mimeType: "image/png", extension: "png", kind: "IMAGE" };
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mimeType: "image/webp", extension: "webp", kind: "IMAGE" };
  return null;
}

let devSecret: string | undefined;
function secret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 16 && !configured.startsWith("replace-with")) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set to sign chat file links");
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}
const mac = (key: string, exp: number) => createHmac("sha256", secret()).update(`chat-file:${key}:${exp}`).digest("base64url");

/** Query string (k, e, s) that opens one chat file until it expires. */
export function signChatFile(key: string, seconds = LINK_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return new URLSearchParams({ k: key, e: String(exp), s: mac(key, exp) }).toString();
}

/** The chat file key from a signed link, or null if the link is wrong or expired. */
export function verifyChatFileLink(params: URLSearchParams): string | null {
  const key = params.get("k") ?? "", exp = Number(params.get("e")), sig = params.get("s") ?? "";
  if (!key.startsWith(CHAT_FILE_PREFIX) || !isValidStorageKey(key) || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = Buffer.from(mac(key, exp)), actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? key : null;
}

/** Replaces each message's stored file key with a signed link the viewer can open. */
export function withChatFileLinks<M extends { attachment?: ChatFile | null }, T extends { messages: M[] }>(data: T, filesPath: string): Omit<T, "messages"> & { messages: Array<Omit<M, "attachment"> & { attachment: ChatFileView | null }> } {
  return {
    ...data,
    messages: data.messages.map((m) => {
      if (!m.attachment) return { ...m, attachment: null };
      const { key, ...rest } = m.attachment;
      return { ...m, attachment: { ...rest, url: `${filesPath}?${signChatFile(key)}` } satisfies ChatFileView };
    }),
  };
}

/** A safe display name: no folders or odd characters, sensible length. */
function cleanName(name: string, extension: string): string {
  const base = name.split(/[\\/]/).pop()!.replace(/[^\w .()-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!base) return `file.${extension}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${extension}`;
}

/**
 * Reads a chat upload (multipart field "file", optional "caption"), checks
 * size and real type, and stores it privately. Throws a message the person
 * can act on.
 */
export async function saveChatUpload(store: ObjectStore, request: Request, chatId: string, maxBytes: number): Promise<{ file: ChatFile; caption: string }> {
  let form: FormData;
  try { form = await request.formData(); } catch { throw new ChatFileError("Choose a photo or PDF to send"); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ChatFileError("Choose a photo or PDF to send");
  if (file.size > maxBytes) throw new ChatFileError(`That file is too big. Send files up to ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectChatFile(bytes);
  if (!detected) throw new ChatFileError("Send a photo (JPG, PNG or WebP) or a PDF");
  const key = `${CHAT_FILE_PREFIX}${chatId}/${randomUUID()}.${detected.extension}`;
  await store.put(key, bytes, detected.mimeType);
  const caption = typeof form.get("caption") === "string" ? String(form.get("caption")).trim().slice(0, 2000) : "";
  return { file: { key, name: cleanName(file.name, detected.extension), mimeType: detected.mimeType, size: bytes.length, kind: detected.kind }, caption };
}

export class ChatFileError extends Error {
  constructor(message: string) { super(message); this.name = "ChatFileError"; }
}

/**
 * Serves a chat file from a signed link. Only verified photos/PDFs are stored,
 * nosniff stops browsers guessing another type, and the app-wide CSP applies.
 */
export async function serveChatFile(store: ObjectStore, params: URLSearchParams): Promise<Response> {
  const key = verifyChatFileLink(params);
  if (!key) return new Response("This link has expired. Open the chat again to see the file.", { status: 403 });
  const bytes = await store.get(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  const detected = detectChatFile(bytes);
  if (!detected) return new Response("Not found", { status: 404 });
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: {
      "content-type": detected.mimeType,
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="chat-file.${detected.extension}"`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
