"use client";

const TITLE_MAX = 60;
const DESC_MAX = 160;

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return <span className={"text-[11px] font-normal " + (n > max ? "text-red-600" : n > max * 0.9 ? "text-amber-600" : "text-slate-400")}>{n}/{max}</span>;
}

/**
 * Search-engine title and description with a Google-style preview. Empty
 * fields fall back to the automatic text shown as placeholders.
 */
export default function SeoFields({ title, description, onTitle, onDescription, autoTitle, autoDescription, path, siteSuffix = true }: {
  title: string;
  description: string;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  autoTitle: string;
  autoDescription: string;
  path: string;
  /** Pages other than the homepage get " | AzadiMart" added to the title. */
  siteSuffix?: boolean;
}) {
  const shownTitle = (title || autoTitle) + (siteSuffix ? " | AzadiMart" : "");
  const shownDescription = description || autoDescription;
  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        <span className="flex items-center justify-between">Search title <Counter value={title} max={TITLE_MAX} /></span>
        <input className={field} maxLength={70} placeholder={autoTitle} value={title} onChange={(e) => onTitle(e.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        <span className="flex items-center justify-between">Search description <Counter value={description} max={DESC_MAX} /></span>
        <textarea className={field + " min-h-20"} maxLength={170} placeholder={autoDescription} value={description} onChange={(e) => onDescription(e.target.value)} />
      </label>
      <div className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Google preview">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Google preview</p>
        <p className="mt-2 truncate text-xs text-slate-600">azadimart.com{path}</p>
        <p className="mt-0.5 line-clamp-1 text-[17px] leading-snug text-[#1a0dab]">{shownTitle}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-slate-600">{shownDescription}</p>
      </div>
      <p className="text-xs text-slate-500">Leave empty to use the automatic text. Aim for about {TITLE_MAX} characters for the title and {DESC_MAX} for the description, and mention what shoppers search for.</p>
    </div>
  );
}
