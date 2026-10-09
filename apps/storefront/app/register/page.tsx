"use client";

import { FormEvent, useRef, useEffect, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@azadimart/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [form,setForm]=useState({fullName:"",email:"",phone:"",password:""});
  // Keep "where to go after signing in" when switching between sign in and create account.
  const [carry, setCarry] = useState("");
  useEffect(() => { const next = new URLSearchParams(window.location.search).get("next"); if (next) setCarry("?next=" + encodeURIComponent(next)); }, []);
  const [error,setError]=useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const captchaRef = useRef<TurnstileHandle>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [busy,setBusy]=useState(false);
  const set=(key:keyof typeof form,value:string)=>setForm((v)=>({...v,[key]:value}));

  async function submit(event:FormEvent){
    event.preventDefault(); setError(""); setBusy(true);
    try{
      const response=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,captchaToken})});
      const body=await response.json();
      if(!response.ok) throw new Error(body?.error?.message ?? "Unable to create your account.");
      // Straight on to sign in, keeping where the shopper was going.
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      router.replace("/login?registered=1" + (/^\/(?![/\\])/.test(next) ? "&next=" + encodeURIComponent(next) : ""));
    }catch(err){setError(err instanceof Error ? err.message : "Unable to create your account.");}
    finally{setBusy(false);captchaRef.current?.reset();}
  }

  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_25px_70px_rgba(15,23,42,0.06)] sm:p-8">
        <Link href="/" className="text-xl font-bold tracking-[-0.04em]">Azadi<span className="text-amber-500">Mart</span></Link>
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Join AzadiMart</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Save your cart, manage orders and checkout faster with a trusted AzadiMart account.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-semibold">Full name<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" value={form.fullName} onChange={(e)=>set("fullName",e.target.value)} required /></label>
          <label className="block text-sm font-semibold">Email<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" type="email" value={form.email} onChange={(e)=>set("email",e.target.value)} required /></label>
          <label className="block text-sm font-semibold">Mobile number<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" type="tel" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e)=>set("phone",e.target.value.replace(/\D/g,"").slice(0,10))} required /></label>
          <label className="block text-sm font-semibold">Password<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" type="password" minLength={8} value={form.password} onChange={(e)=>set("password",e.target.value)} required /></label>
          <Turnstile ref={captchaRef} siteKey={siteKey} onToken={setCaptchaToken} action="register" />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy || Boolean(siteKey && !captchaToken)} className="w-full rounded-full bg-brand px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">{busy ? "Creating account…" : "Create account"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">Already registered? <Link href={"/login" + carry} className="font-semibold text-slate-950 underline">Sign in</Link></p>
      </div>
    </main>
  );
}
