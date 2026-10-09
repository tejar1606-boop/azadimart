"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type FormState={
  preferredProvider:"MANUAL"|"SHIPROCKET"|"DELHIVERY"|"SHADOWFAX";
  pickup:{name:string;phone:string;line1:string;line2:string;city:string;state:string;postalCode:string;country:"IN"};
};

const empty:FormState={
  preferredProvider:"MANUAL",
  pickup:{name:"",phone:"",line1:"",line2:"",city:"",state:"",postalCode:"",country:"IN"},
};

export default function ShippingSettingsPage(){
  const [form,setForm]=useState<FormState>(empty);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{void (async()=>{
    try{
      const response=await fetch("/api/v1/shipping-settings",{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error?.message??"Unable to load shipping settings.");
      if(body.settings)setForm({...empty,...body.settings,pickup:{...empty.pickup,...body.settings.pickup}});
    }catch(err){setError(err instanceof Error?err.message:"Unable to load shipping settings.");}
    finally{setLoading(false);}
  })();},[]);

  async function save(){
    setSaving(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/v1/shipping-settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error?.message??"Unable to save shipping settings.");
      setForm(body.settings);setMessage("Shipping settings saved.");
    }catch(err){setError(err instanceof Error?err.message:"Unable to save shipping settings.");}
    finally{setSaving(false);}
  }

  const setPickup=(key:keyof FormState["pickup"],value:string)=>setForm(current=>({...current,pickup:{...current.pickup,[key]:value}}));

  if(loading)return <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10"><div className="h-96 animate-pulse rounded-[2rem] bg-white"/></main>;

  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
    <Link href="/orders" className="text-sm font-semibold text-slate-500">← Orders</Link>
    <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Fulfillment setup</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Shipping.</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Save your pickup address and choose the provider you plan to use. External carrier credentials are added later.</p>

    <section className="mt-7 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <label className="text-sm font-bold">Preferred logistics provider</label>
      <select value={form.preferredProvider} onChange={e=>setForm(current=>({...current,preferredProvider:e.target.value as FormState["preferredProvider"]}))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <option value="MANUAL">Manual testing</option>
        <option value="SHIPROCKET">Shiprocket (credentials pending)</option>
        <option value="DELHIVERY">Delhivery (credentials pending)</option>
        <option value="SHADOWFAX">Shadowfax (credentials pending)</option>
      </select>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {([["name","Pickup contact name"],["phone","Pickup phone"],["line1","Address line 1"],["line2","Address line 2 (optional)"],["city","City"],["state","State"],["postalCode","PIN code"]] as const).map(([key,label])=><label key={key} className={key==="line1"||key==="line2"?"sm:col-span-2":" "}><span className="text-sm font-semibold">{label}</span><input value={form.pickup[key]} onChange={e=>setPickup(key,e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" /></label>)}
      </div>

      {form.preferredProvider!=="MANUAL"?<div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">This provider is saved as your preference, but it will remain unavailable until its official credentials and API configuration are added.</div>:null}
      {error?<div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}
      {message?<div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>:null}
      <button type="button" disabled={saving} onClick={()=>void save()} className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?"Saving…":"Save shipping settings"}</button>
    </section>
  </main>;
}
