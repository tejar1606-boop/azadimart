"use client";

import { FormEvent, useEffect, useState } from "react";

type Coupon = {
  id:string; code:string; title:string; description?:string|null;
  discountType:"PERCENTAGE"|"FIXED"|"FREE_SHIPPING"; discountValue:number;
  minimumOrderPaise:number; maximumDiscountPaise?:number|null; usageLimit?:number|null;
  usageCount:number; perCustomerLimit:number; firstOrderOnly:boolean; stackable:boolean;
  fundingType:"AZADIMART"|"SELLER"; sellerId?:string|null; isActive:boolean;
};
type Seller = { id:string; storeName:string; status:string };

const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});

export default function CouponsManager(){
  const [items,setItems]=useState<Coupon[]>([]);
  const [sellers,setSellers]=useState<Seller[]>([]);
  const [message,setMessage]=useState("Loading…");
  const [busy,setBusy]=useState(false);
  const [f,setF]=useState({
    code:"WELCOME10",title:"Welcome to AzadiMart",description:"10% off your first order",
    discountType:"PERCENTAGE",discountValue:"10",minimumOrder:"999",maximumDiscount:"",
    startsAt:new Date().toISOString().slice(0,16),endsAt:"",usageLimit:"",perCustomerLimit:"1",
    firstOrderOnly:true,stackable:false,fundingType:"AZADIMART",sellerId:"",isActive:true,
  });

  async function load(){
    const [couponRes,sellerRes]=await Promise.all([
      fetch("/api/v1/coupons",{cache:"no-store"}),
      fetch("/api/v1/sellers?page=1&pageSize=100",{cache:"no-store"}),
    ]);
    const couponData=await couponRes.json(); const sellerData=await sellerRes.json();
    if(!couponRes.ok) throw new Error(couponData?.error?.message??"Unable to load coupons");
    setItems(couponData.coupons);
    if(sellerRes.ok) setSellers((sellerData.sellers??[]).filter((s:Seller)=>s.status==="ACTIVE"));
    setMessage(couponData.coupons.length+" coupon(s)");
  }

  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setMessage("");
    try{
      if(f.fundingType==="SELLER"&&!f.sellerId) throw new Error("Select the seller who funds this coupon.");
      const body={
        ...f,
        // FIXED amounts are entered in rupees but stored in paise like every other amount.
        discountValue:f.discountType==="FIXED"?Math.round(Number(f.discountValue)*100):Number(f.discountValue),
        minimumOrderPaise:Number(f.minimumOrder)*100,
        maximumDiscountPaise:f.maximumDiscount?Number(f.maximumDiscount)*100:undefined,
        startsAt:new Date(f.startsAt).toISOString(),
        endsAt:f.endsAt?new Date(f.endsAt).toISOString():undefined,
        usageLimit:f.usageLimit?Number(f.usageLimit):undefined,
        perCustomerLimit:Number(f.perCustomerLimit),
        sellerId:f.fundingType==="SELLER"?f.sellerId:undefined,
      };
      const r=await fetch("/api/v1/coupons",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message??"Create failed");
      setItems(x=>[d.coupon,...x]); setMessage("Coupon created");
      setF({...f,code:"",title:"",description:"",discountValue:f.discountValue});
    }catch(e){setMessage(e instanceof Error?e.message:"Something went wrong");}
    finally{setBusy(false);}
  }

  async function toggle(c:Coupon){
    const r=await fetch("/api/v1/coupons/"+c.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({isActive:!c.isActive})});
    const d=await r.json();
    if(r.ok) setItems(x=>x.map(v=>v.id===c.id?d.coupon:v)); else setMessage(d?.error?.message??"Update failed");
  }

  return <div className="space-y-6">
    <header className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Marketing</p>
      <h1 className="mt-1 text-2xl font-bold">Coupons & discounts</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">Create offers for the storefront. Customer coupon validation is server-side and applies usage limits and eligibility rules.</p>
    </header>

    <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Create coupon</h2>
        <input required className="w-full rounded-lg border p-2.5" placeholder="Coupon code" value={f.code} onChange={e=>setF({...f,code:e.target.value.toUpperCase()})}/>
        <input required className="w-full rounded-lg border p-2.5" placeholder="Title" value={f.title} onChange={e=>setF({...f,title:e.target.value})}/>
        <textarea className="min-h-20 w-full rounded-lg border p-2.5" placeholder="Description" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/>
        <div className="grid grid-cols-2 gap-3">
          <select className="rounded-lg border p-2.5" value={f.discountType} onChange={e=>setF({...f,discountType:e.target.value})}>
            <option value="PERCENTAGE">% off</option><option value="FIXED">₹ off</option><option value="FREE_SHIPPING">Free shipping</option>
          </select>
          <input required type="number" min="0" max={f.discountType==="PERCENTAGE"?100:100000} className="rounded-lg border p-2.5" placeholder="Value" value={f.discountValue} onChange={e=>setF({...f,discountValue:e.target.value})}/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min="0" className="rounded-lg border p-2.5" placeholder="Min order ₹" value={f.minimumOrder} onChange={e=>setF({...f,minimumOrder:e.target.value})}/>
          <input type="number" min="0" className="rounded-lg border p-2.5" placeholder="Max discount ₹" value={f.maximumDiscount} onChange={e=>setF({...f,maximumDiscount:e.target.value})}/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min="1" className="rounded-lg border p-2.5" placeholder="Usage limit" value={f.usageLimit} onChange={e=>setF({...f,usageLimit:e.target.value})}/>
          <input type="number" min="1" max="100" className="rounded-lg border p-2.5" placeholder="Per customer" value={f.perCustomerLimit} onChange={e=>setF({...f,perCustomerLimit:e.target.value})}/>
        </div>
        <div className="grid gap-3">
          <label className="text-xs font-semibold text-slate-500">Starts<input type="datetime-local" className="mt-1 w-full rounded-lg border p-2.5 text-sm" value={f.startsAt} onChange={e=>setF({...f,startsAt:e.target.value})}/></label>
          <label className="text-xs font-semibold text-slate-500">Ends<input type="datetime-local" className="mt-1 w-full rounded-lg border p-2.5 text-sm" value={f.endsAt} onChange={e=>setF({...f,endsAt:e.target.value})}/></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select className="rounded-lg border p-2.5" value={f.fundingType} onChange={e=>setF({...f,fundingType:e.target.value})}><option value="AZADIMART">AzadiMart funded</option><option value="SELLER">Seller funded</option></select>
          <select disabled={f.fundingType!=="SELLER"} className="rounded-lg border p-2.5 disabled:bg-slate-50" value={f.sellerId} onChange={e=>setF({...f,sellerId:e.target.value})}><option value="">Select seller</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.storeName}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.firstOrderOnly} onChange={e=>setF({...f,firstOrderOnly:e.target.checked})}/> First order only</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.stackable} onChange={e=>setF({...f,stackable:e.target.checked})}/> Stackable</label>
        </div>
        <button disabled={busy} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?"Creating…":"Create coupon"}</button>
        <p role="status" className="text-xs text-slate-500">{message}</p>
      </form>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Existing coupons</h2><span className="text-xs text-slate-500">{items.length}</span></div>
        <div className="mt-4 space-y-3">
          {items.length===0?<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No coupons yet.</div>:items.map(c=><div key={c.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-950 px-2 py-1 font-mono text-xs font-bold text-white">{c.code}</span><b className="text-sm">{c.title}</b><span className={"rounded-full px-2 py-1 text-[11px] "+(c.isActive?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{c.isActive?"Active":"Paused"}</span></div><p className="mt-1 text-xs text-slate-500">{c.discountType==="PERCENTAGE"?c.discountValue+"% off":c.discountType==="FIXED"?money(c.discountValue)+" off":"Free shipping"} · min {money(c.minimumOrderPaise)} · {c.fundingType==="SELLER"?"Seller funded":"AzadiMart funded"} · used {c.usageCount}{c.usageLimit?" / "+c.usageLimit:""}</p></div>
            <button onClick={()=>toggle(c)} className="rounded-lg border px-3 py-2 text-xs font-semibold">{c.isActive?"Pause":"Activate"}</button>
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}
