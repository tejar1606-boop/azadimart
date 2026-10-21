"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LOIMART_RATE_CARD } from "@azadimart/shared";

const rupees=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});

type FormState={
  shipWith:"LOIMART";
  preferredProvider:"MANUAL"|"SHIPROCKET"|"DELHIVERY"|"SHADOWFAX";
  pickup:{name:string;phone:string;line1:string;line2:string;city:string;state:string;postalCode:string;country:"IN"};
};

const empty:FormState={
  shipWith:"LOIMART",
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
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">LOIMART delivers all your orders. Save the address our courier picks up from.</p>

    <section className="mt-7 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-sm font-bold">LOIMART ships every order</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">You pack and print the label. When you tap <b>Ready to ship</b>, LOIMART books the courier, it picks up from your address and tracking updates by itself. The fee is paid from your <a href="/wallet" className="font-semibold text-slate-900 underline">courier wallet</a>; anything it doesn&apos;t cover comes off your payout.</p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <p className="bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">LOIMART shipping fee (incl. GST, paid from your courier wallet)</p>
        <table className="w-full text-sm"><thead className="text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-2">Delivering to</th><th className="px-4 py-2 text-right">Up to 500 g</th><th className="px-4 py-2 text-right">Each extra 500 g</th></tr></thead>
          <tbody>{(["local","regional","national"] as const).map(z=><tr key={z} className="border-t border-slate-100"><td className="px-4 py-2 font-semibold">{LOIMART_RATE_CARD[z].label}</td><td className="px-4 py-2 text-right">{rupees(LOIMART_RATE_CARD[z].first500g)}</td><td className="px-4 py-2 text-right">{rupees(LOIMART_RATE_CARD[z].extra500g)}</td></tr>)}</tbody></table>
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Cash on Delivery orders add {rupees(LOIMART_RATE_CARD.codFeePaise)} for cash collection. Weight is the package weight on your products. Example: a 400 g parcel to another state = {rupees(LOIMART_RATE_CARD.national.first500g)}.</p>
      </div>

      <p className="mt-7 text-sm font-bold">Pickup address</p>
      <p className="mt-0.5 text-xs text-slate-500">The courier collects parcels from here. It&apos;s also printed as the return address.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {([["name","Pickup contact name"],["phone","Pickup phone"],["line1","Address line 1"],["line2","Address line 2 (optional)"],["city","City"],["state","State"],["postalCode","PIN code"]] as const).map(([key,label])=><label key={key} className={key==="line1"||key==="line2"?"sm:col-span-2":" "}><span className="text-sm font-semibold">{label}</span><input value={form.pickup[key]} onChange={e=>setPickup(key,e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" /></label>)}
      </div>

      {error?<div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}
      {message?<div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>:null}
      <button type="button" disabled={saving} onClick={()=>void save()} className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?"Saving…":"Save shipping settings"}</button>
    </section>
  </main>;
}
