"use client";

import { useEffect, useRef, useState } from "react";
import { INDIA_STATES } from "@azadimart/shared";
import dynamic from "next/dynamic";
import type { LatLng } from "./address-map";

// Leaflet needs the browser, so the map loads on the client only.
const AddressMap = dynamic(() => import("./address-map").then((m) => m.AddressMap), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-100" /> });

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

/** "Add new address": a map with a pin and search on top, the "Deliver to" form below. Full screen on phones, a centred box on larger screens. */
export function AddressSheet({ contact, first, onClose, onSaved }: { contact: { name: string; phone: string }; first: boolean; onClose: () => void; onSaved: (address: SavedAddress) => void }) {
  const [f, setF] = useState({ line1: "", line2: "", postalCode: "", city: "", state: "", recipientName: contact.name, recipientPhone: contact.phone, alternatePhone: "", otherName: "" });
  const [type, setType] = useState<AddressType | "">("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [key]: v })); setError(""); };
  const [locating, setLocating] = useState(false);
  const [editing, setEditing] = useState(false);
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

  // A full PIN code typed by the shopper fills in the city and state.
  useEffect(() => {
    if (!editing || !/^[1-9][0-9]{5}$/.test(f.postalCode)) return;
    let live = true;
    lookup("pin=" + f.postalCode).then((b) => { if (!live) return; if (b.found) fill(b.found, false); else if (b.message) setNote({ ok: false, text: b.message }); }).catch(() => undefined);
    return () => { live = false; };
  }, [f.postalCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const [goTo, setGoTo] = useState<(LatLng & { key: number }) | null>(null);
  const [pinned, setPinned] = useState(false);
  const [finding, setFinding] = useState(false);
  const here = useRef<LatLng | null>(null);

  // The pin moved (dragged, located or searched): fill the address from that spot.
  async function pinAt(at: LatLng, placeName?: string) {
    here.current = at;
    setFinding(true); setNote(null);
    try {
      const b = await lookup(`lat=${at.lat.toFixed(5)}&lng=${at.lng.toFixed(5)}`);
      if (!b.found) { setNote({ ok: false, text: b.message ?? "We couldn't find this spot. Move the pin or type your address." }); return; }
      // A place picked from search ("Sakra World Hospital") leads the locality line.
      const area = placeName && !b.found.area.toLowerCase().includes(placeName.toLowerCase()) ? [placeName, b.found.area].filter(Boolean).join(", ") : b.found.area;
      fill({ ...b.found, area }, true); setPinned(true);
      if (!b.found.postalCode || !b.found.state || !b.found.city) setEditing(true);
    } catch (err) { setNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't find this spot." }); }
    finally { setFinding(false); }
  }

  function locateMe() {
    setNote(null);
    if (!("geolocation" in navigator)) { setNote({ ok: false, text: "This browser can't share your location. Search for your area or type your address." }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocating(false);
      const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setGoTo({ ...at, key: Date.now() });
      void pinAt(at);
    }, (err) => {
      setLocating(false);
      setNote({ ok: false, text: err.code === err.PERMISSION_DENIED ? "Location is off for this site. Search for your area above, or allow location in your browser settings." : "Couldn't get your location. Search for your area above or move the pin." });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  // Find the shopper as soon as the page opens, like the big shopping apps do.
  useEffect(() => { locateMe(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<{ name: string; detail: string; lat: number; lng: number }[]>([]);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) { setPlaces([]); return; }
    let live = true;
    const near = here.current ? `&lat=${here.current.lat.toFixed(2)}&lng=${here.current.lng.toFixed(2)}` : "";
    const t = setTimeout(() => {
      fetch(`/api/v1/geo?q=${encodeURIComponent(text)}${near}`, { cache: "no-store" }).then((r) => r.json()).then((b) => { if (live) setPlaces(b.places ?? []); }).catch(() => undefined);
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  function pick(place: { name: string; lat: number; lng: number }) {
    setPlaces([]); setQ("");
    (document.activeElement as HTMLElement | null)?.blur();
    setGoTo({ lat: place.lat, lng: place.lng, key: Date.now() });
    void pinAt(place, place.name);
  }

  // Keep the page behind from scrolling while the sheet is open.
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  function problem() {
    if (f.line1.trim().length < 3) return "Enter the flat, house or building name.";
    const place = f.line2.trim().length < 3 ? "Enter the area, sector or locality." : !/^[1-9][0-9]{5}$/.test(f.postalCode) ? "Enter a valid 6-digit PIN code." : f.city.trim().length < 2 ? "Enter the city or town." : !f.state ? "Choose the state." : "";
    if (place) { setEditing(true); return place; }
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

  const located = pinned && Boolean(f.line2 || f.city);
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 sm:flex sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-address" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-white sm:h-[92vh] sm:max-w-lg sm:overflow-hidden sm:rounded-3xl">
        <div className="flex h-14 shrink-0 items-center gap-3 px-3">
          <button type="button" onClick={onClose} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 12H4m6-6-6 6 6 6" /></svg>
          </button>
          <h2 id="add-address" className="text-lg font-semibold">Add new address</h2>
        </div>

        <div className={"relative isolate h-[34vh] min-h-[200px] shrink-0 sm:h-[260px] " + (places.length ? "z-20" : "")}>
          <AddressMap goTo={goTo} onMove={(at) => void pinAt(at)} />
          <div className="absolute inset-x-3 top-3 z-[1001]">
            <label className="flex h-12 items-center gap-2.5 rounded-xl bg-white px-3.5 shadow-lg ring-1 ring-slate-200">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by area, name, street…" aria-label="Search for your area" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500" />
              {q ? <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-slate-400">✕</button> : null}
            </label>
            {places.length ? (
              <ul className="mt-1.5 max-h-60 overflow-y-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
                {places.map((p) => (
                  <li key={`${p.lat},${p.lng},${p.name}`}>
                    <button type="button" onClick={() => pick(p)} className="flex w-full gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50">
                      <span className="mt-0.5 text-slate-400"><PinIcon /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-xs text-slate-500">{p.detail}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button type="button" onClick={locateMe} disabled={locating}
            className="absolute bottom-8 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-brand shadow-lg ring-1 ring-slate-200 disabled:opacity-70">
            <svg viewBox="0 0 24 24" className={"h-[18px] w-[18px] " + (locating ? "animate-spin" : "")} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
            {locating ? "Locating…" : "Use current location"}
          </button>
        </div>

        <div className="relative z-10 -mt-5 flex min-h-0 flex-1 flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between px-5 pb-2 pt-4 sm:px-6">
            <h3 className="text-xl font-semibold">Deliver to</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-slate-700 hover:bg-slate-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto px-5 pb-4 sm:px-6">
            <p className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              Make sure your address details are correct so your order reaches you on time.
            </p>
            {note ? <p className={"mt-3 text-sm " + (note.ok ? "text-green-700" : "text-amber-700")}>{note.text}</p> : null}
            <div className="mt-4 grid gap-4">
              <Field label="Flat / House no. / Building name" required value={f.line1} onChange={set("line1")} max={160} autoComplete="address-line1" />
              {editing ? (
                <>
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
                </>
              ) : (
                <div className="relative rounded-xl bg-slate-100 px-4 pb-3.5 pt-5">
                  <span className="absolute -top-2.5 left-3 rounded bg-white px-1.5 text-xs font-semibold text-slate-500">Area / Sector / Locality *</span>
                  {located ? (
                    <div className="flex items-center gap-3">
                      <p className="min-w-0 flex-1 text-[15px] leading-6 text-slate-800">
                        {f.line2}{f.line2 ? <br /> : null}
                        <b className="text-slate-950">{[f.city, f.state, f.postalCode].filter(Boolean).join(", ")}</b>
                      </p>
                      <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-brand bg-white px-3.5 py-1.5 text-sm font-semibold text-brand">Change</button>
                    </div>
                  ) : (
                    <div className="text-[15px] text-slate-600">
                      {finding || locating ? "Finding your address…" : "Use your current location, search above, or move the map to put the pin on your building."}
                      <button type="button" onClick={() => setEditing(true)} className="mt-2 block text-sm font-semibold text-brand">Type the address instead</button>
                    </div>
                  )}
                  {finding && located ? <p className="mt-1 text-xs text-slate-500">Updating…</p> : null}
                </div>
              )}
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
          <div className="mt-auto border-t border-slate-100 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            {error ? <p role="alert" className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}
            <button type="button" disabled={saving} onClick={() => void save()} className="h-14 w-full rounded-xl bg-brand text-lg font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving…" : "Save address"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
