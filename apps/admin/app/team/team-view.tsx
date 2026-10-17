"use client";

import { PortalPageHeader } from "@azadimart/ui";
import { STAFF_PERMISSIONS, STAFF_PERMISSION_KEYS, type StaffPermission } from "@azadimart/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

type Member = { userId: string; email: string; name: string; isOwner: boolean; roleId: string | null; roleName: string; permissions: StaffPermission[]; isActive: boolean; lastLoginAt: string | null; createdAt: string };
type Role = { id: string; name: string; description: string; permissions: StaffPermission[]; isSystem: boolean; members: number };
type Data = { me: { userId: string; permissions: StaffPermission[]; fullAccess: boolean }; members: Member[]; roles: Role[] };

const lastSeen = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Never signed in");
/** A readable 12-character temporary password. */
function tempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function AreaPicker({ value, onChange, allowed }: { value: StaffPermission[]; onChange: (v: StaffPermission[]) => void; allowed: StaffPermission[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {STAFF_PERMISSION_KEYS.map((key) => {
        const on = value.includes(key);
        const can = allowed.includes(key);
        return (
          <label key={key} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition " + (on ? "border-brand bg-brand-50/60" : "border-slate-200 hover:border-slate-300") + (can ? "" : " cursor-not-allowed opacity-50")}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#f97316]" checked={on} disabled={!can} onChange={(e) => onChange(e.target.checked ? [...value, key] : value.filter((v) => v !== key))} />
            <span><span className="block font-semibold">{STAFF_PERMISSIONS[key].label}</span><span className="block text-xs text-slate-500">{STAFF_PERMISSIONS[key].description}</span></span>
          </label>
        );
      })}
    </div>
  );
}

function AreaChips({ permissions }: { permissions: StaffPermission[] }) {
  if (STAFF_PERMISSION_KEYS.every((k) => permissions.includes(k))) return <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-white">Everything</span>;
  return <>{permissions.map((p) => <span key={p} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{STAFF_PERMISSIONS[p]?.label ?? p}</span>)}</>;
}

export default function TeamView() {
  const [tab, setTab] = useState<"members" | "roles">("members");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", password: "", roleId: "" });
  const [roleForm, setRoleForm] = useState<null | { id?: string; name: string; description: string; permissions: StaffPermission[] }>(null);

  const load = useCallback(() => fetch("/api/v1/team", { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't load the team"); setData(b); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  const within = useCallback((perms: StaffPermission[]) => !!data && perms.every((p) => data.me.permissions.includes(p)), [data]);
  const assignable = useMemo(() => (data?.roles ?? []).filter((r) => within(r.permissions)), [data, within]);

  async function send(url: string, method: string, body: unknown, done: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't save");
      setNotice(done);
      await load();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); return false; } finally { setBusy(false); }
  }

  const editable = (m: Member) => !!data && m.userId !== data.me.userId && !m.isOwner && within(m.permissions);
  const roleById = (id: string) => data?.roles.find((r) => r.id === id);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Team" title="Team & roles" description="Give each team member their own sign-in and a role. A role decides which areas of the admin portal they can open; the server checks it on every action." />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-white p-1 text-sm font-semibold shadow-card ring-1 ring-slate-200" role="tablist">
          {(["members", "roles"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={"rounded-full px-4 py-2 " + (tab === t ? "bg-navy text-white" : "text-slate-600 hover:text-slate-950")}>
              {t === "members" ? `Members${data ? ` (${data.members.length})` : ""}` : `Roles${data ? ` (${data.roles.length})` : ""}`}
            </button>
          ))}
        </div>
        {tab === "members" ? (
          <button type="button" onClick={() => { setAdding((v) => !v); setForm({ displayName: "", email: "", password: tempPassword(), roleId: assignable.find((r) => r.name !== "Admin")?.id ?? "" }); }} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">{adding ? "Cancel" : "Add team member"}</button>
        ) : (
          <button type="button" onClick={() => setRoleForm(roleForm && !roleForm.id ? null : { name: "", description: "", permissions: ["dashboard"] })} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">{roleForm && !roleForm.id ? "Cancel" : "Create role"}</button>
        )}
      </div>

      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-xl bg-india-light px-4 py-3 text-sm text-india-dark">{notice}</p> : null}

      {tab === "members" ? (
        <>
          {adding ? (
            <form onSubmit={async (e) => { e.preventDefault(); if (await send("/api/v1/team/members", "POST", form, `${form.displayName} can now sign in at this portal with ${form.email} and the temporary password. Share it privately.`)) setAdding(false); }}
              className="mt-4 grid gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:grid-cols-2">
              <label className="text-sm font-medium">Name<input required minLength={2} maxLength={60} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="e.g. Priya Sharma" /></label>
              <label className="text-sm font-medium">Work email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="priya@yourcompany.com" /></label>
              <label className="text-sm font-medium">Temporary password
                <span className="mt-1.5 flex gap-2"><input required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm" /><button type="button" onClick={() => setForm({ ...form, password: tempPassword() })} className="shrink-0 rounded-xl border border-slate-300 px-3 text-xs font-semibold hover:border-slate-900">New</button></span>
                <span className="mt-1 block text-xs font-normal text-slate-500">At least 10 characters. Share it privately; they can sign in right away.</span>
              </label>
              <label className="text-sm font-medium">Role
                <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="" disabled>Choose a role</option>
                  {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {form.roleId && roleById(form.roleId) ? <span className="mt-2 flex flex-wrap gap-1.5"><AreaChips permissions={roleById(form.roleId)!.permissions} /></span> : null}
              </label>
              <div className="flex justify-end lg:col-span-2"><button type="submit" disabled={busy} className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{busy ? "Adding…" : "Add member"}</button></div>
            </form>
          ) : null}

          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
            {!data && !error ? <p className="px-5 py-10 text-center text-sm text-slate-500">Loading…</p> : null}
            <ul className="divide-y divide-slate-100">
              {data?.members.map((m) => {
                const canEdit = editable(m);
                return (
                  <li key={m.userId} className={"grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center " + (m.isActive ? "" : "bg-slate-50/70")}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase text-white " + (m.isActive ? "bg-navy" : "bg-slate-400")}>{m.name.slice(0, 2)}</span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-semibold">{m.name}{m.userId === data.me.userId ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">You</span> : null}{!m.isActive ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">Switched off</span> : null}</span>
                        <span className="block truncate text-sm text-slate-500">{m.email} · {lastSeen(m.lastLoginAt)}</span>
                      </span>
                    </span>
                    <span>
                      {canEdit ? (
                        <select aria-label={`Role for ${m.name}`} disabled={busy} value={m.roleId ?? ""} onChange={(e) => void send(`/api/v1/team/members/${m.userId}`, "PATCH", { roleId: e.target.value }, `${m.name} is now ${roleById(e.target.value)?.name}. It applies straight away.`)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                          {!m.roleId ? <option value="">{m.roleName}</option> : null}
                          {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      ) : <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{m.roleName}</span>}
                    </span>
                    <span className="flex flex-wrap gap-2 lg:justify-end">
                      {canEdit ? (
                        <>
                          <button type="button" disabled={busy} onClick={() => { const name = prompt("Name", m.name); if (name && name.trim().length >= 2) void send(`/api/v1/team/members/${m.userId}`, "PATCH", { displayName: name.trim() }, "Name updated."); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900">Rename</button>
                          <button type="button" disabled={busy} onClick={() => { const pw = tempPassword(); if (confirm(`Set a new temporary password for ${m.name}?\n\n${pw}\n\nCopy it before continuing. They will be signed out.`)) void send(`/api/v1/team/members/${m.userId}`, "PATCH", { password: pw }, `New password for ${m.name}: ${pw}`); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900">Reset password</button>
                          <button type="button" disabled={busy} onClick={() => { if (m.isActive && !confirm(`Switch off ${m.name}? They're signed out at once and their open support requests become unassigned.`)) return; void send(`/api/v1/team/members/${m.userId}`, "PATCH", { isActive: !m.isActive }, m.isActive ? `${m.name} is switched off.` : `${m.name} can sign in again.`); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (m.isActive ? "border border-red-200 text-red-700 hover:bg-red-50" : "bg-india text-white")}>{m.isActive ? "Switch off" : "Switch on"}</button>
                        </>
                      ) : <span className="text-xs text-slate-400">{m.userId === data.me.userId ? "Another admin can change your access" : m.isOwner ? "Owner" : "Has more access than you"}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <section className="mt-4 space-y-3">
          {roleForm ? (
            <form onSubmit={async (e) => { e.preventDefault(); const ok = await send(roleForm.id ? `/api/v1/team/roles/${roleForm.id}` : "/api/v1/team/roles", roleForm.id ? "PATCH" : "POST", { name: roleForm.name, description: roleForm.description, permissions: roleForm.permissions }, roleForm.id ? "Role updated. Everyone with it has the new access now." : `Role “${roleForm.name}” created.`); if (ok) setRoleForm(null); }}
              className="space-y-4 rounded-2xl border border-brand-200 bg-white p-5 shadow-card">
              <h2 className="font-semibold">{roleForm.id ? `Edit ${roleForm.name}` : "New role"}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Role name<input required minLength={2} maxLength={40} value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="e.g. Returns desk" /></label>
                <label className="text-sm font-medium">Description<input maxLength={160} value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="What this person does" /></label>
              </div>
              <div><p className="mb-2 text-sm font-medium">Areas they can open</p><AreaPicker value={roleForm.permissions} onChange={(permissions) => setRoleForm({ ...roleForm, permissions })} allowed={data?.me.permissions ?? []} /></div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRoleForm(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={busy || !roleForm.permissions.length} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{roleForm.id ? "Save role" : "Create role"}</button>
              </div>
            </form>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {data?.roles.map((r) => {
              const canEdit = within(r.permissions) && !data.members.some((m) => m.userId === data.me.userId && m.roleId === r.id);
              return (
                <article key={r.id} className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">{r.name}{r.isSystem ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ready-made</span> : null}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">{r.description || "Custom role"}</p>
                    </div>
                    <span className="shrink-0 text-sm text-slate-500">{r.members} {r.members === 1 ? "person" : "people"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5"><AreaChips permissions={r.permissions} /></div>
                  <div className="mt-auto flex gap-2 pt-4">
                    {canEdit ? <button type="button" onClick={() => setRoleForm({ id: r.id, name: r.name, description: r.description, permissions: r.permissions })} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900">Edit</button> : null}
                    {canEdit && !r.isSystem ? <button type="button" disabled={busy || r.members > 0} title={r.members ? "Move its people to another role first" : undefined} onClick={() => { if (confirm(`Delete the role “${r.name}”?`)) void send(`/api/v1/team/roles/${r.id}`, "DELETE", undefined, "Role deleted."); }} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">Delete</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
