"use client";

import { FormEvent, useRef, useEffect, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@azadimart/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "../components/site-header";
import AuthScene, { AuthField, SecureNote } from "../components/auth-scene";

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [form,setForm]=useState({fullName:"",email:"",phone:"",password:"",referralCode:""});
  // Keep "where to go after signing in" when switching between sign in and create account.
  const [carry, setCarry] = useState("");
  useEffect(() => { const next = new URLSearchParams(window.location.search).get("next"); if (next) setCarry("?next=" + encodeURIComponent(next)); }, []);
  // A friend's invite link (…/register?ref=LMXXXXXX) fills in their code.
  useEffect(() => { const ref = new URLSearchParams(window.location.search).get("ref"); if (ref) setForm((v) => ({ ...v, referralCode: ref.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })); }, []);
  const [error,setError]=useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const captchaRef = useRef<TurnstileHandle>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [busy,setBusy]=useState(false);
  const set=(key:keyof typeof form,value:string)=>setForm((v)=>({...v,[key]:value}));

  async function submit(event:FormEvent){
    event.preventDefault(); setError(""); setBusy(true);
    try{
      const response=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,referralCode:form.referralCode.trim()||undefined,captchaToken})});
      const body=await response.json();
      if(!response.ok) throw new Error(body?.error?.message ?? "Unable to create your account.");
      // Straight on to sign in, keeping where the shopper was going.
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      // New shoppers go on to their wallet to verify their mobile and get the welcome bonus.
      router.replace("/login?registered=1&next=" + encodeURIComponent(/^\/(?![/\\])/.test(next) ? next : "/account/wallet"));
    }catch(err){setError(err instanceof Error ? err.message : "Unable to create your account.");}
    finally{setBusy(false);captchaRef.current?.reset();}
  }

  return (
    <AuthScene headline={<>Join free.<br /><span className="text-[#F9CB5B]">Save</span> from your first order.</>} sub="Create your LOIMART account in a minute and shop today's best deals from verified Indian sellers.">
      <div className="mx-auto max-w-lg rounded-[2rem] border border-white/60 bg-white p-6 shadow-[0_30px_80px_rgba(2,6,23,0.45)] sm:p-8">
        <Link href="/" aria-label="LOIMART home"><Wordmark className="text-2xl" /></Link>
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Join LOIMART</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Save your cart, manage orders and checkout faster with a trusted LOIMART account.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <AuthField label="Full name" icon="name" autoComplete="name" placeholder="As you'd like it on deliveries" value={form.fullName} onChange={(e)=>set("fullName",e.target.value)} required />
          <AuthField label="Email" icon="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e)=>set("email",e.target.value)} required />
          <AuthField label="Mobile number" icon="phone" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit mobile" value={form.phone} onChange={(e)=>set("phone",e.target.value.replace(/\D/g,"").slice(0,10))} required />
          <AuthField label="Password" icon="password" type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" value={form.password} onChange={(e)=>set("password",e.target.value)} required />
          <AuthField label="Referral code (optional)" icon="name" autoCapitalize="characters" placeholder="Friend's code, e.g. LM7K2QXP" value={form.referralCode} onChange={(e)=>set("referralCode",e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12))} />
          <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="register" />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy || Boolean(siteKey && !captchaToken)} className="w-full rounded-full bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(229,133,48,0.9)] transition hover:bg-brand-600 disabled:opacity-50">{busy ? "Creating account…" : "Create account"}</button>
          <SecureNote />
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">Already registered? <Link href={"/login" + carry} className="font-semibold text-slate-950 underline">Sign in</Link></p>
      </div>
    </AuthScene>
  );
}
