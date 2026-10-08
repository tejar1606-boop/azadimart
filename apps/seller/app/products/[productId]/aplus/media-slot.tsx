"use client";

import { directUpload, readImageSize } from "@azadimart/ui";
import { useRef, useState } from "react";

/** One A+ image/video slot: upload with progress, shape check, preview, remove. */
export default function MediaSlot({ label, kind, size, value, onChange, optional = false }: {
  label: string;
  kind: "image" | "video";
  size?: { width: number; height: number };
  value?: string;
  onChange: (url: string | undefined) => void;
  optional?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError(""); setBusy(true); setProgress(0);
    try {
      if (kind === "image" && size) {
        const actual = await readImageSize(file);
        const want = size.width / size.height;
        if (Math.abs(actual.width / actual.height - want) / want > 0.02) {
          throw new Error(`This image is ${actual.width} × ${actual.height}. Use ${size.width} × ${size.height} (same shape).`);
        }
      }
      const result = await directUpload(file, { purpose: kind === "image" ? "APLUS_IMAGE" : "PRODUCT_VIDEO", onProgress: setProgress });
      onChange(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="text-sm">
      <p className="font-semibold">{label}{optional ? <span className="font-normal text-slate-400"> (optional)</span> : null}</p>
      {size ? <p className="text-xs text-slate-400">{size.width} × {size.height} px</p> : <p className="text-xs text-slate-400">MP4, WebM or MOV, any quality</p>}
      <div className="mt-2 flex items-center gap-3">
        <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {value ? (kind === "image"
            ? <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${value}")` }} />
            : <video src={value} className="h-full w-full object-cover" muted playsInline />)
            : <span className="text-[11px] text-slate-400">None</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? `Uploading… ${progress}%` : value ? "Replace" : "Upload"}
          </button>
          {value ? <button type="button" onClick={() => onChange(undefined)} className="text-xs font-semibold text-red-600">Remove</button> : null}
        </div>
      </div>
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
      <input ref={input} type="file" hidden accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    </div>
  );
}
