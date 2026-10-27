"use client";

import { useEffect, useRef, useState } from "react";
import { INDIA_STATES } from "@azadimart/shared";

export type SavedAddress = { id: string; label: string | null; recipientName: string | null; recipientPhone: string | null; alternatePhone: string | null; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string; isDefault: boolean };

const STATES = INDIA_STATES;
const TYPES = ["Home", "Office", "Others"] as const;
type AddressType = (typeof TYPES)[number];
const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

/** Outlined box whose label sits on the border once there's something in it. */
function Field({ label, required, value, onChange, numeric, max, autoComplete }: { label: string; required?: boolean; value: string; onChange: (v: string) => void; numeric?: number; max?: number; autoComplete?: string }) {
  return (
    <label className="relative block">
      <input value={value} placeholder=" " autoComplete={autoComplete} inputMode={numeric ? "numeric" : undefined} maxLength={numeric ?? max}
        onChange={(e) => onChange(numeric ? digits(e.target.value, numeric) : e.target.value)}
        className="peer h-14 w-full rounded-xl border border-slate-300 bg-white px-4 pt-1 text-[15px] text-slate-950 outline-none transition focus:border-brand focus:ring-1 focus:ring-brand" />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-[15px] text-slate-500 transition-all peer-focus:top-0 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-brand peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs">
        {label}{required ? " *" : " (Optional)"}
      </span>
    </label>
  );
}

const HomeIcon = () => <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" strokeLinejoin="round" /></svg>;
const OfficeIcon = () => <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 21V5l8-2v18M12 8h8v13M2 21h20M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" strokeLinejoin="round" /></svg>;
const PinIcon = () => <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
const ICONS: Record<AddressType, () => React.JSX.Element> = { Home: HomeIcon, Office: OfficeIcon, Others: PinIcon };

/** "Deliver to" form: a bottom sheet on phones, a centred box on larger screens. */
export function AddressSheet({ contact, first, onClose, onSaved }: { contact: { name: string; phone: string }; first: boolean; onClose: () => void; onSaved: (address: SavedAddress) => void }) {
  const [f, setF] = useState({ line1: "", line2: "", postalCode: "", city: "", state: "", recipientName: contact.name, recipientPhone: contact.phone, alternatePhone: "", otherName: "" });
  const [type, setType] = useState<AddressType | "">("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [key]: v })); setError(""); };
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // City/state the lookup filled in; a new PIN may replace these, never what the shopper typed.
  const auto = useRef({ city: "", state: "" });

  async function lookup(query: string) {
    const r = await fetch("/api/v1/geo?" + query, { cache: "no-store" });
    const b = await r.json().catch(() => null);
    if (!r.ok) throw new Error(b?.error?.message ?? "Lookup failed");
    return b as { found: { area: string; city: string; state: string; postalCode: string } | null; message?: string };
  }
  function fill(found: { area: string; city: string; state: string; postalCode: string }, withArea: boolean) {
    setF((x) => ({
      ...x,
      line2: withArea && found.area ? found.area : x.line2,
      postalCode: found.postalCode || x.postalCode,
      city: found.city && (!x.city || x.city === auto.current.city || withArea) ? found.city : x.city,
      state: found.state && (!x.state || x.state === auto.current.state || withArea) ? found.state : x.state,
    }));
    auto.current = { city: found.city, state: found.state };
  }

  // A full PIN code fills in the city and state.
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(f.postalCode)) return;
    let live = true;
    lookup("pin=" + f.postalCode).then((b) => { if (!live) return; if (b.found) fill(b.found, false); else if (b.message) setNote({ ok: false, text: b.message }); }).catch(() => undefined);
    return () => { live = false; };
  }, [f.postalCode]); // eslint-disable-line react-hooks/exhaustive-deps

  function useMyLocation() {
    setNote(null);
    if (!("geolocation" in navigator)) { setNote({ ok: false, text: "This browser can't share your location. Please type your address." }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const b = await lookup(`lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}`);
        if (!b.found) setNote({ ok: false, text: b.message ?? "We couldn't find your address. Please type it in." });
        else { fill(b.found, true); setNote({ ok: true, text: "Address filled from your location. Add your flat / house no. and check the details." }); }
      } catch (err) { setNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't find your location." }); }
      finally { setLocating(false); }
    }, (err) => {
      setLocating(false);
      setNote({ ok: false, text: err.code === err.PERMISSION_DENIED ? "Location is blocked. Allow location for this site in your browser settings, or type your address." : "Couldn't get your location. Please try again or type your address." });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  // Keep the page behind from scrolling while the sheet is open.
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  function problem() {
    if (f.line1.trim().length < 3) return "Enter the flat, house or building name.";
    if (f.line2.trim().length < 3) return "Enter the area, sector or locality.";
    if (!/^[1-9][0-9]{5}$/.test(f.postalCode)) return "Enter a valid 6-digit PIN code.";
    if (f.city.trim().length < 2) return "Enter the city or town.";
    if (!f.state) return "Choose the state.";
    if (f.recipientName.trim().length < 2) return "Enter the full name of the person receiving the order.";
    if (!/^[6-9][0-9]{9}$/.test(f.recipientPhone)) return "Enter a valid 10-digit mobile number.";
    if (f.alternatePhone && !/^[6-9][0-9]{9}$/.test(f.alternatePhone)) return "Enter a valid 10-digit alternate number, or leave it empty.";
    if (!type) return "Choose the type of address: Home, Office or Others.";
    if (type === "Others" && f.otherName.trim().length < 2) return "Give this address a name, e.g. Mom's house.";
    return "";
  }

  async function save() {
    const why = problem();
    if (why) { setError(why); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/v1/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        label: type === "Others" ? f.otherName.trim() : type, line1: f.line1, line2: f.line2, postalCode: f.postalCode, city: f.city, state: f.state,
        recipientName: f.recipientName, recipientPhone: f.recipientPhone, alternatePhone: f.alternatePhone, country: "IN", isDefault: first,
      }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Couldn't save the address.");
      onSaved(b.item);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save the address."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="deliver-to" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6">
          <h2 id="deliver-to" className="text-xl font-semibold">Deliver to</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-slate-700 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4 sm:px-6">
          <p className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
            Make sure your address details are correct so your order reaches you on time.
          </p>
          <button type="button" onClick={useMyLocation} disabled={locating}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand px-4 py-3 text-[15px] font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-60">
            <svg viewBox="0 0 24 24" className={"h-5 w-5 " + (locating ? "animate-spin" : "")} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
            {locating ? "Finding your location…" : "Use my current location"}
          </button>
          {note ? <p className={"mt-2 text-sm " + (note.ok ? "text-green-700" : "text-amber-700")}>{note.text}</p> : null}
          <div className="mt-5 grid gap-4">
            <Field label="Flat / House no. / Building name" required value={f.line1} onChange={set("line1")} max={160} autoComplete="address-line1" />
            <Field label="Area / Sector / Locality" required value={f.line2} onChange={set("line2")} max={160} autoComplete="address-line2" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="PIN code" required value={f.postalCode} onChange={set("postalCode")} numeric={6} autoComplete="postal-code" />
              <Field label="City / Town" required value={f.city} onChange={set("city")} max={80} autoComplete="address-level2" />
            </div>
            <label className="relative block">
              <select value={f.state} onChange={(e) => set("state")(e.target.value)} autoComplete="address-level1"
                className={"h-14 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 pt-1 text-[15px] outline-none focus:border-brand focus:ring-1 focus:ring-brand " + (f.state ? "text-slate-950" : "text-slate-500")}>
                <option value="">State *</option>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {f.state ? <span className="pointer-events-none absolute left-3 top-0 -translate-y-1/2 bg-white px-1 text-xs text-slate-500">State *</span> : null}
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </label>
            <Field label="Full name" required value={f.recipientName} onChange={set("recipientName")} max={80} autoComplete="name" />
            <Field label="10-digit mobile number" required value={f.recipientPhone} onChange={set("recipientPhone")} numeric={10} autoComplete="tel-national" />
            <Field label="Alternate phone number" value={f.alternatePhone} onChange={set("alternatePhone")} numeric={10} />
          </div>
          <p className="mt-6 text-sm text-slate-500">Type of address *</p>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {TYPES.map((t) => { const Icon = ICONS[t]; return (
              <button key={t} type="button" onClick={() => { setType(t); setError(""); }} aria-pressed={type === t}
                className={"flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[15px] transition " + (type === t ? "border-brand bg-brand/5 font-semibold text-brand" : "border-slate-300 text-slate-800 hover:border-slate-500")}>
                <Icon />{t}
              </button>
            ); })}
          </div>
          {type === "Others" ? <div className="mt-4"><Field label="Name this address (e.g. Mom's house)" required value={f.otherName} onChange={set("otherName")} max={30} /></div> : null}
        </div>
        <div className="border-t border-slate-100 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          {error ? <p role="alert" className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}
          <button type="button" disabled={saving} onClick={() => void save()} className="h-14 w-full rounded-xl bg-brand text-lg font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving…" : "Save address"}</button>
        </div>
      </div>
    </div>
  );
}
