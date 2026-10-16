"use client";

import { useRef } from "react";

/** A photo or PDF in a live chat message, as the API returns it (signed, expiring link). */
export type ChatAttachment = { url: string; name: string; mimeType: string; size: number; kind: "IMAGE" | "DOCUMENT" };

/** What a chat accepts: photos and PDFs up to 10 MB. */
export const CHAT_FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;

const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** A message's photo (tap to open full size) or PDF (file card that opens it). */
export function ChatAttachmentView({ file, mine }: { file: ChatAttachment; mine: boolean }) {
  if (file.kind === "IMAGE") {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl" aria-label={`Open photo ${file.name}`}>
        <img src={file.url} alt={file.name} loading="lazy" decoding="async" className="max-h-60 w-full min-w-[160px] max-w-[260px] bg-black/5 object-cover" />
      </a>
    );
  }
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className={"flex min-w-[200px] max-w-[260px] items-center gap-2.5 rounded-xl px-3 py-2.5 transition " + (mine ? "bg-white/15 hover:bg-white/25" : "bg-slate-100 hover:bg-slate-200")}>
      <span className="grid h-9 w-8 shrink-0 place-items-center rounded-md bg-red-600 text-[9px] font-bold text-white">PDF</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{file.name}</span>
        <span className={"block text-[11px] " + (mine ? "text-white/70" : "text-slate-500")}>{sizeText(file.size)} · Tap to open</span>
      </span>
    </a>
  );
}

/** Paperclip button that picks a photo or PDF; checks type and size before handing it over. */
export function ChatFileButton({ onFile, onError, disabled, className = "" }: { onFile: (file: File) => void; onError: (message: string) => void; disabled?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} aria-label="Send a photo or PDF" title="Send a photo or PDF (up to 10 MB)"
        className={"grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 " + className}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" /></svg>
      </button>
      <input ref={input} type="file" accept={CHAT_FILE_ACCEPT} hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!CHAT_FILE_ACCEPT.split(",").includes(file.type)) return onError("Send a photo (JPG, PNG or WebP) or a PDF");
        if (file.size > CHAT_FILE_MAX_BYTES) return onError("That file is too big. Send files up to 10 MB.");
        onFile(file);
      }} />
    </>
  );
}
