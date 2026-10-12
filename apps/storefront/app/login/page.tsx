"use client";

import { FormEvent, useRef, useEffect, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@azadimart/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthScene, { AuthField, SecureNote } from "../components/auth-scene";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  // Keep "where to go after signing in" when switching between sign in and create account.
  const [carry, setCarry] = useState("");
  const [justRegistered, setJustRegistered] = useState(false);
  useEffect(() => { const next = new URLSearchParams(window.location.search).get("next"); if (next) setCarry("?next=" + encodeURIComponent(next)); setJustRegistered(new URLSearchParams(window.location.search).has("registered")); }, []);
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
    <AuthScene headline={<>Welcome back to<br /><span className="text-brand-300">India&apos;s own</span> marketplace.</>} sub="Handpicked products from KYC-verified Indian sellers, with Cash on Delivery and easy 7-day returns.">
      <div className="mx-auto max-w-md rounded-[2rem] border border-white/60 bg-white p-6 shadow-[0_30px_80px_rgba(2,6,23,0.45)] sm:p-8">
        <Link href="/" className="text-xl font-bold tracking-[-0.04em]">Azadi<span className="text-amber-500">Mart</span></Link>
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">Sign in to shop</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Access your cart, orders, addresses and personalized shopping experience.</p>
        {justRegistered ? <p role="status" className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">Your account is ready. Sign in to continue.</p> : null}
        <form onSubmit={submit} className="mt-7 space-y-4">
          <AuthField label="Email" icon="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <AuthField label="Password" icon="password" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="login" />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy || Boolean(siteKey && !captchaToken)} className="w-full rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(234,88,12,0.7)] transition hover:from-brand-600 hover:to-brand-700 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
          <SecureNote />
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">New to AzadiMart? <Link href={"/register" + carry} className="font-semibold text-slate-950 underline">Create account</Link></p>
      </div>
    </AuthScene>
  );
}
