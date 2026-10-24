"use client";

import { useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

/** Employees replace the password HR gave them. */
export default function ChangePasswordPage() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (form.newPassword !== form.confirm) { setMsg({ ok: false, text: "The new passwords don't match." }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/my/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Couldn't change the password");
      setForm({ currentPassword: "", newPassword: "", confirm: "" }); setMsg({ ok: true, text: "Password changed. Use the new one next time you sign in." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't change the password" }); } finally { setBusy(false); }
  }
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Account" title="Change password" description="Replace the password HR gave you with your own. At least 10 characters." />
      <form onSubmit={save} className="mt-6 grid max-w-md gap-3 border border-slate-200 bg-white p-6 shadow-card">
        <label className="text-sm font-medium">Current password<input type="password" autoComplete="current-password" className={field} value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></label>
        <label className="text-sm font-medium">New password<input type="password" autoComplete="new-password" minLength={10} className={field} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /></label>
        <label className="text-sm font-medium">Repeat new password<input type="password" autoComplete="new-password" minLength={10} className={field} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></label>
        <button disabled={busy} className="mt-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Change password"}</button>
        {msg ? <p className={"rounded-lg px-3 py-2 text-sm " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{msg.text}</p> : null}
      </form>
    </main>
  );
}
