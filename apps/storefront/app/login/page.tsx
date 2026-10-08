"use client";

import { FormEvent, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@azadimart/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const captchaRef = useRef<TurnstileHandle>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to sign in.");
      // Return to the page that asked for sign-in (same-site paths only), else the account page.
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      router.replace(/^\/(?![/\\])/.test(next) ? next : "/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally { setBusy(false); captchaRef.current?.reset(); }
  }

  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_25px_70px_rgba(15,23,42,0.06)] sm:p-8">
        <Link href="/" className="text-xl font-bold tracking-[-0.04em]">Azadi<span className="text-amber-500">Mart</span></Link>
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">Sign in to shop</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Access your cart, orders, addresses and personalized shopping experience.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-semibold">Email<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
          <label className="block text-sm font-semibold">Password<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>
          <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="login" />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy || Boolean(siteKey && !captchaToken)} className="w-full rounded-full bg-brand px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">New to AzadiMart? <Link href="/register" className="font-semibold text-slate-950 underline">Create account</Link></p>
      </div>
    </main>
  );
}
