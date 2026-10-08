"use client";

import { useRef, useState } from "react";

/** Upload (or paste a link to) a storefront image or video, with preview. */
export default function MediaField({
  label,
  hint,
  kind,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  kind: "image" | "video";
  value: string;
  onChange: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showLink, setShowLink] = useState(false);

  async function upload(file: File) {
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v1/media", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? (response.status === 413 ? "File is too large" : "Upload failed"));
      if ((kind === "image") !== (body.kind === "IMAGE")) throw new Error(kind === "image" ? "Please choose an image file" : "Please choose a video file");
      onChange(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="text-sm font-medium md:col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {hint ? <span className="text-xs font-normal text-slate-400">{hint}</span> : null}
      </div>
      <div className="mt-1.5 flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 sm:flex-row sm:items-center">
        <div className="grid h-24 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-white sm:w-40">
          {value ? (
            kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <video src={value} className="h-full w-full object-cover" muted playsInline controls />
            )
          ) : (
            <span className="text-xs font-normal text-slate-400">No {kind} yet</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {uploading ? "Uploading…" : value ? `Replace ${kind}` : `Upload ${kind}`}
            </button>
            {value ? <button type="button" onClick={() => onChange("")} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700">Remove</button> : null}
            <button type="button" onClick={() => setShowLink((v) => !v)} className="px-1 text-xs font-normal text-slate-500 underline">or paste a link</button>
          </div>
          <p className="text-xs font-normal text-slate-500">{kind === "image" ? "JPG, PNG or WebP, up to 15 MB." : "MP4 or WebM, up to 100 MB. Plays muted on loop."}</p>
          {showLink ? (
            <input className="w-full rounded-lg border bg-white p-2 text-xs font-normal" placeholder="https://…" value={value.startsWith("/media/") ? "" : value} onChange={(event) => onChange(event.target.value.trim())} />
          ) : null}
          {error ? <p className="text-xs font-normal text-red-600">{error}</p> : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
