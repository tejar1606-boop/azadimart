"use client";

import { PortalPageHeader } from "@azadimart/ui";
import { useEffect, useState } from "react";

type Reply = { id: string; title: string; body: string };

const STARTERS: Array<Omit<Reply, "id">> = [
  { title: "Refund timeline", body: "Hi {name}, your refund has been started. It goes back to your original payment method and usually reaches you in 5–7 working days. We'll update you here if anything changes." },
  { title: "Checking with the courier", body: "Hi {name}, thanks for letting us know. We've raised this with the courier partner and will update you here within 24 hours." },
  { title: "KYC documents unclear", body: "Hi {name}, one of your KYC documents isn't clear enough to verify. Please upload a sharp photo or PDF in KYC, making sure the name matches your PAN." },
  { title: "Payout schedule", body: "Hi {name}, each order is paid automatically 7 days after delivery to your verified bank account. You can see upcoming payouts and UTR numbers in Payments." },
];

export default function SavedReplies() {
  const [items, setItems] = useState<Reply[] | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/v1/support/canned", { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't load"); setItems(b.items); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  async function save(reply: Omit<Reply, "id">) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/v1/support/canned", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reply) });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't save");
      setForm({ title: "", body: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this saved reply?")) return;
    await fetch(`/api/v1/support/canned/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Support" title="Saved replies" description="Answers the team sends often. Insert them from a ticket's reply box; {name} becomes the customer's first name or the seller's store name." />
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          {items?.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6">
              <p className="font-semibold">No saved replies yet</p>
              <p className="mt-1 text-sm text-slate-500">Start with these common ones:</p>
              <div className="mt-3 flex flex-wrap gap-2">{STARTERS.map((s) => <button key={s.title} type="button" disabled={busy} onClick={() => void save(s)} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:border-slate-900">+ {s.title}</button>)}</div>
            </div>
          ) : null}
          {items?.map((r) => (
            <article key={r.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{r.title}</h2><button type="button" onClick={() => void remove(r.id)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button></div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{r.body}</p>
            </article>
          ))}
        </section>
        <form onSubmit={(e) => { e.preventDefault(); void save(form); }} className="h-fit space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="font-semibold">New saved reply</h2>
          <label className="block text-sm font-medium">Title<input required minLength={2} maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Refund timeline" /></label>
          <label className="block text-sm font-medium">Message<textarea required minLength={2} maxLength={4000} rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Hi {name}, …" /></label>
          <button type="submit" disabled={busy} className="w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">Save reply</button>
        </form>
      </div>
    </main>
  );
}
