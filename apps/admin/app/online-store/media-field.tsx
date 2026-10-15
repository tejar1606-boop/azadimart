"use client";

import { directUpload, readImageSize } from "@azadimart/ui";
import { useRef, useState } from "react";

function readVideoSize(source: File | string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    video.preload = "metadata"; video.muted = true;
    video.onloadedmetadata = () => { resolve({ width: video.videoWidth, height: video.videoHeight }); if (typeof source !== "string") URL.revokeObjectURL(url); };
    video.onerror = () => reject(new Error("Couldn't read this video. Use MP4 (H.264), WebM or MOV."));
    video.src = url;
  });
}

function readUrlSize(url: string, kind: "image" | "video"): Promise<{ width: number; height: number }> {
  if (kind === "video") return readVideoSize(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Couldn't load an image from this link."));
    img.src = url;
  });
}

/** Upload (or paste a link to) a storefront image or video, with preview. */
export default function MediaField({
  label,
  hint,
  kind,
  value,
  onChange,
  size,
}: {
  label: string;
  hint?: string;
  kind: "image" | "video";
  value: string;
  onChange: (url: string) => void;
  /** Required image size: the shape must match (it fills a fixed frame); smaller files only warn. */
  size?: { width: number; height: number };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [warning, setWarning] = useState("");
  const [progress, setProgress] = useState(0);

  /** The frame on the store is fixed, so the file must be the same shape (2% leeway); smaller only warns. */
  function checkShape(actual: { width: number; height: number }) {
    if (!size) return;
    const expectedRatio = size.width / size.height;
    if (Math.abs(actual.width / actual.height - expectedRatio) / expectedRatio > 0.02) {
      throw new Error(`This ${kind} is ${actual.width} × ${actual.height}. Use ${size.width} × ${size.height} (or the same shape) so nothing gets cropped or squashed.`);
    }
    if (actual.width < size.width * (kind === "video" ? 0.5 : 1)) {
      setWarning(`Added at ${actual.width} × ${actual.height}. ${size.width} × ${size.height} looks sharper on large screens.`);
    }
  }

  /** A pasted link is checked the same way as an upload once it loads. */
  async function applyLink(url: string) {
    setError(""); setWarning("");
    onChange(url);
    if (!size || !/^https:\/\//i.test(url)) return;
    try { checkShape(await readUrlSize(url, kind)); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't check this link"); onChange(""); }
  }

  async function upload(file: File) {
    setError("");
    setWarning("");
    setUploading(true);
    try {
      if (size) checkShape(kind === "image" ? await readImageSize(file) : await readVideoSize(file));
      setProgress(0);
      const result = await directUpload(file, { purpose: kind === "image" ? "SITE_IMAGE" : "SITE_VIDEO", onProgress: setProgress });
      onChange(result.url);
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
        {/* Preview in the exact shape the store shows (fixed frame), so what you see is what shoppers see. */}
        <div className="grid w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-white sm:w-40" style={size ? { aspectRatio: `${size.width} / ${size.height}`, maxHeight: 200 } : { height: 96 }}>
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
              {uploading ? `Uploading… ${progress}%` : value ? `Replace ${kind}` : `Upload ${kind}`}
            </button>
            {value ? <button type="button" onClick={() => onChange("")} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700">Remove</button> : null}
            <button type="button" onClick={() => setShowLink((v) => !v)} className="px-1 text-xs font-normal text-slate-500 underline">or paste a link</button>
          </div>
          <p className="text-xs font-normal text-slate-500">{kind === "image" ? "JPG, PNG or WebP (high-quality WebP welcome), up to 50 MB." : "MP4, WebM or MOV, any quality. Plays muted on loop; MP4 (H.264) plays everywhere."}</p>
          {showLink ? (
            <input className="w-full rounded-lg border bg-white p-2 text-xs font-normal" placeholder="https://…" value={value.startsWith("/media/") ? "" : value} onChange={(event) => void applyLink(event.target.value.trim())} />
          ) : null}
          {uploading ? <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-950 transition-[width]" style={{ width: progress + "%" }} /></div> : null}
          {error ? <p className="text-xs font-normal text-red-600">{error}</p> : null}
          {warning ? <p className="text-xs font-normal text-amber-700">{warning}</p> : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
