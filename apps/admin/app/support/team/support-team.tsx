"use client";

import { PortalPageHeader } from "@azadimart/ui";
import { useEffect, useState } from "react";

type Member = { userId: string; email: string; role: string; name: string; isActive: boolean; openTickets: number; lastLoginAt: string | null };

export default function SupportTeam() {
  const [data, setData] = useState<{ items: Member[]; canManage: boolean } | null>(null);
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/v1/support/agents", { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't load"); setData(b); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  async function send(url: string, method: string, body: unknown, done: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't save");
      setNotice(done);
      await load();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); return false; } finally { setBusy(false); }
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Support" title="Support team" description="Admins can work tickets. Support agents sign in to this portal with their own email and see only the Support desk." />
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-xl bg-india-light px-4 py-3 text-sm text-india-dark">{notice}</p> : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <ul className="divide-y divide-slate-100">
            {data?.items.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold uppercase text-white">{m.name.slice(0, 2)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{m.name} {!m.isActive ? <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Off</span> : null}</span>
                  <span className="block truncate text-sm text-slate-500">{m.email} · {m.role === "SUPPORT" ? "Support agent" : m.role === "SUPER_ADMIN" ? "Super admin" : "Admin"}</span>
                </span>
                <span className="text-sm text-slate-600">{m.openTickets} open</span>
                {data.canManage ? (
                  <span className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => { const name = prompt("Display name shown on replies", m.name); if (name && name.trim().length >= 2) void send(`/api/v1/support/agents/${m.userId}`, "PATCH", { displayName: name.trim() }, "Name updated."); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900">Rename</button>
                    <button type="button" disabled={busy} onClick={() => { if (m.isActive && !confirm(`Switch off ${m.name}? Their open tickets become unassigned${m.role === "SUPPORT" ? " and they are signed out" : ""}.`)) return; void send(`/api/v1/support/agents/${m.userId}`, "PATCH", { isActive: !m.isActive }, m.isActive ? "Switched off." : "Switched on."); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (m.isActive ? "border border-red-200 text-red-700 hover:bg-red-50" : "bg-india text-white")}>{m.isActive ? "Switch off" : "Switch on"}</button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        {data?.canManage ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (await send("/api/v1/support/agents", "POST", form, `${form.displayName} can now sign in with ${form.email}.`)) setForm({ displayName: "", email: "", password: "" }); }} className="h-fit space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <h2 className="font-semibold">Add a support agent</h2>
            <label className="block text-sm font-medium">Name shown on replies<input required minLength={2} maxLength={60} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Priya" /></label>
            <label className="block text-sm font-medium">Work email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-medium">Temporary password<input required type="password" minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /><span className="mt-1 block text-xs font-normal text-slate-500">At least 10 characters. Share it privately.</span></label>
            <button type="submit" disabled={busy} className="w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">Add agent</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
