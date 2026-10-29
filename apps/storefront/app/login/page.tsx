"use client";

import { FormEvent, useRef, useEffect, useState } from "react";
import { LoginMethodTabs, OtpLoginForm, Turnstile, type TurnstileHandle, useOtpAvailable } from "@azadimart/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "../components/site-header";
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
  const otpAvailable = useOtpAvailable();
  const [method, setMethod] = useState<"password" | "otp">("password");
  // Return to the page that asked for sign-in (same-site paths only), else the account page.
  const goNext = () => { const next = new URLSearchParams(window.location.search).get("next") ?? ""; router.replace(/^\/(?![/\\])/.test(next) ? next : "/account"); };

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
      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally { setBusy(false); captchaRef.current?.reset(); }
  }

  return (
    <AuthScene headline={<>Your offers<br />are <span className="text-[#F9CB5B]">waiting.</span></>} sub="Sign in to grab today's biggest deals from KYC-verified Indian sellers.">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-white/60 bg-white p-6 shadow-[0_30px_80px_rgba(2,6,23,0.45)] sm:p-8">
        <Link href="/" aria-label="LOIMART home"><Wordmark className="text-2xl" /></Link>
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">Sign in to shop</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Access your cart, orders, addresses and personalized shopping experience.</p>
        {justRegistered ? <p role="status" className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">Your account is ready. Sign in to continue, then verify your mobile to get your <b>₹101 welcome bonus</b>.</p> : null}
        {otpAvailable ? <div className="mt-7"><LoginMethodTabs method={method} onChange={(m) => { setMethod(m); setError(""); }} /></div> : null}
        {otpAvailable && method === "otp" ? (
          <div className="mt-6"><OtpLoginForm onSuccess={goNext} buttonClassName="w-full rounded-full bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(229,133,48,0.9)] transition hover:bg-brand-600 disabled:opacity-50" /></div>
        ) : (
        <form onSubmit={submit} className={(otpAvailable ? "mt-6" : "mt-7") + " space-y-4"}>
          <AuthField label="Email" icon="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <AuthField label="Password" icon="password" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="login" />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy || Boolean(siteKey && !captchaToken)} className="w-full rounded-full bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(229,133,48,0.9)] transition hover:bg-brand-600 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
          <SecureNote />
        </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">New to LOIMART? <Link href={"/register" + carry} className="font-semibold text-slate-950 underline">Create account</Link></p>
        <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">By continuing, you agree to LOIMART&apos;s <Link href="/terms" className="underline underline-offset-2">Terms</Link> and <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
      </div>
    </AuthScene>
  );
}
