"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    storeName: "",
    legalName: "",
    email: "",
    phone: "",
    gstin: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        ...form,
        gstin: form.gstin.trim() || undefined,
      };

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Registration failed. Please check your details.");
        return;
      }

      router.replace("/login");
    } catch {
      setError("Unable to register right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm uppercase tracking-wide text-ink-muted">seller.azadimart.com</p>
        <h1 className="mt-2 text-3xl font-semibold">Create seller account</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Registration creates your seller account. KYC and admin approval are required before selling.
        </p>

        <form onSubmit={submit} className="mt-8 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium">
            Store name
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.storeName} onChange={(e) => setField("storeName", e.target.value)} required />
          </label>

          <label className="text-sm font-medium">
            Legal name
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.legalName} onChange={(e) => setField("legalName", e.target.value)} required />
          </label>

          <label className="text-sm font-medium">
            Email
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" type="email" autoComplete="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
          </label>

          <label className="text-sm font-medium">
            Mobile number
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} required />
          </label>

          <label className="text-sm font-medium">
            GSTIN <span className="font-normal text-ink-muted">(optional)</span>
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase" value={form.gstin} onChange={(e) => setField("gstin", e.target.value.toUpperCase())} maxLength={15} />
          </label>

          <label className="text-sm font-medium">
            Password
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => setField("password", e.target.value)} required />
          </label>

          {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}

          <div className="md:col-span-2 flex flex-wrap items-center gap-4">
            <button className="rounded-lg bg-saffron px-5 py-2 font-medium text-white disabled:opacity-60" type="submit" disabled={loading}>
              {loading ? "Creating account…" : "Create seller account"}
            </button>
            <Link href="/login" className="text-sm text-saffron underline">
              Already registered? Sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
