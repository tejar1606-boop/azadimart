"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Category = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean; sortOrder: number; productCount: number; liveCount: number };

const field = "h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900";
const small = "grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-xs hover:border-slate-900 disabled:opacity-30";

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; parentId: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/catalog/categories", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "Could not load categories");
    setItems(body.items);
  }, []);
  useEffect(() => { load().catch((err) => setError(err.message)).finally(() => setLoading(false)); }, [load]);

  async function call(url: string, init: RequestInit, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(body?.error?.details) && body.error.details[0] ? `: ${body.error.details[0].message}` : "";
        throw new Error((body?.error?.message ?? "Something went wrong") + detail);
      }
      await load();
      setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally { setBusy(false); }
  }

  const topLevel = items.filter((c) => !c.parentId);
  const childrenOf = (id: string) => items.filter((c) => c.parentId === id);

  function reorder(group: Category[], index: number, delta: number) {
    const j = index + delta;
    if (j < 0 || j >= group.length) return;
    const ids = group.map((c) => c.id);
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    // Show the new order immediately, then save it.
    setItems((all) => all.map((c) => (ids.includes(c.id) ? { ...c, sortOrder: ids.indexOf(c.id) + 1 } : c)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
    void call("/api/v1/catalog/categories/order", { method: "PUT", body: JSON.stringify({ ids }) }, "Order saved.");
  }

  // A plain render function (not a component) so the edit box keeps focus while typing.
  function renderRow(category: Category, group: Category[], index: number) {
    const isEditing = editing?.id === category.id;
    const hasChildren = childrenOf(category.id).length > 0;
    return (
      <div key={category.id} className={"flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between " + (category.parentId ? "bg-panel/60 pl-8 sm:pl-12" : "")}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex gap-1">
            <button type="button" className={small} disabled={busy || index === 0} onClick={() => reorder(group, index, -1)} aria-label={`Move ${category.name} up`}>↑</button>
            <button type="button" className={small} disabled={busy || index === group.length - 1} onClick={() => reorder(group, index, 1)} aria-label={`Move ${category.name} down`}>↓</button>
          </div>
          {isEditing ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
              e.preventDefault();
              void call(`/api/v1/catalog/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name: editing.name, parentId: editing.parentId || null }) }, "Category updated.").then((ok) => ok && setEditing(null));
            }}>
              <input autoFocus value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={field + " h-9 w-48"} />
              {!hasChildren ? (
                <select value={editing.parentId} onChange={(e) => setEditing({ ...editing, parentId: e.target.value })} className={field + " h-9"} aria-label="Parent category">
                  <option value="">Top level</option>
                  {topLevel.filter((c) => c.id !== category.id).map((c) => <option key={c.id} value={c.id}>Inside {c.name}</option>)}
                </select>
              ) : null}
              <button disabled={busy} className="rounded-full bg-chrome px-4 py-1.5 text-xs font-semibold text-white">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="text-xs font-semibold text-slate-500">Cancel</button>
            </form>
          ) : (
            <div className="min-w-0">
              <p className="truncate font-semibold">{category.parentId ? <span className="text-slate-400">↳ </span> : null}{category.name}
                {!category.isActive ? <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Hidden</span> : null}
              </p>
              <p className="text-xs text-slate-500">{category.liveCount} live · {category.productCount} total products · /{category.slug}</p>
            </div>
          )}
        </div>
        {!isEditing ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <Link href={`/catalog/arrange?categoryId=${category.id}`} className="rounded-full px-3 py-1.5 ring-1 ring-slate-200 hover:ring-slate-900">Products &amp; order</Link>
            <button type="button" onClick={() => setEditing({ id: category.id, name: category.name, parentId: category.parentId ?? "" })} className="rounded-full px-3 py-1.5 ring-1 ring-slate-200 hover:ring-slate-900">Edit</button>
            <button type="button" disabled={busy} onClick={() => void call(`/api/v1/catalog/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !category.isActive }) }, category.isActive ? `${category.name} is hidden from the store.` : `${category.name} is visible on the store.`)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-200 hover:ring-slate-900">{category.isActive ? "Hide" : "Show"}</button>
            <button type="button" disabled={busy || category.productCount > 0 || hasChildren} title={category.productCount > 0 ? "Move its products to another category first" : hasChildren ? "Remove its sub-categories first" : "Delete"} onClick={() => setConfirmDelete(category)} className="rounded-full px-3 py-1.5 text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-30">Delete</button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader
        eyebrow="Catalogue"
        title="Categories"
        description="Create categories and sub-categories, set the order they appear in on the store, and hide the ones you don't need."
        actions={<Link href="/catalog/arrange" className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Arrange products</Link>}
      />

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          void call("/api/v1/catalog/categories", { method: "POST", body: JSON.stringify({ name, parentId: parentId || null }) }, `"${name.trim()}" created.`).then((ok) => { if (ok) setName(""); });
        }}
      >
        <label className="text-sm font-medium">New category
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Footwear" className={field + " mt-1 block w-64"} required />
        </label>
        <label className="text-sm font-medium">Place it
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={field + " mt-1 block"}>
            <option value="">As a main category</option>
            {topLevel.map((c) => <option key={c.id} value={c.id}>Inside {c.name}</option>)}
          </select>
        </label>
        <button disabled={busy || name.trim().length < 2} className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">Add category</button>
      </form>

      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {loading ? <p className="p-6 text-sm text-slate-500">Loading…</p> : topLevel.length === 0 ? <p className="p-6 text-sm text-slate-500">No categories yet. Add your first one above.</p> : (
          <div className="divide-y divide-slate-100">
            {topLevel.map((category, index) => {
              const children = childrenOf(category.id);
              return (
                <div key={category.id} className="divide-y divide-slate-100">
                  {renderRow(category, topLevel, index)}
                  {children.map((child, i) => renderRow(child, children, i))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">The order here is the order of category tiles and menus on the store. A category can only be deleted when it has no products; hide it instead to keep its products.</p>

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
            <h2 id="delete-title" className="text-lg font-semibold">Delete &ldquo;{confirmDelete.name}&rdquo;?</h2>
            <p className="mt-2 text-sm text-slate-600">This category is empty. Deleting it can&apos;t be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void call(`/api/v1/catalog/categories/${confirmDelete.id}`, { method: "DELETE" }, `"${confirmDelete.name}" deleted.`).then(() => setConfirmDelete(null))} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
