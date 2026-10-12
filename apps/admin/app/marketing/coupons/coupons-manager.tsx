"use client";

import { FormEvent, useEffect, useState } from "react";

type Coupon = {
  id:string; code:string; title:string; description?:string|null;
  discountType:"PERCENTAGE"|"FIXED"|"FREE_SHIPPING"; discountValue:number;
  minimumOrderPaise:number; maximumDiscountPaise?:number|null; usageLimit?:number|null;
  usageCount:number; perCustomerLimit:number; firstOrderOnly:boolean; stackable:boolean;
  fundingType:"AZADIMART"|"SELLER"|"SELLERS"; sellerId?:string|null; isActive:boolean; appliesTo?:string;
};
type PickProduct = { id:string; title:string; sellerName:string; sellerId:string; couponMaxDiscountPct:number; status?:string };
type Category = { id:string; name:string; parentId?:string|null };
type ScopeMode = "ALL"|"PRODUCTS"|"CATEGORIES"|"SELLERS";
type Seller = { id:string; storeName:string; status:string };

const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});

export default function CouponsManager(){
  const [items,setItems]=useState<Coupon[]>([]);
  const [sellers,setSellers]=useState<Seller[]>([]);
  const [message,setMessage]=useState("Loading…");
  const [busy,setBusy]=useState(false);
  const [warnings,setWarnings]=useState<string[]>([]);
  // Which products the coupon applies to.
  const [scopeMode,setScopeMode]=useState<ScopeMode>("ALL");
  const [picked,setPicked]=useState<PickProduct[]>([]);
  const [categoryIds,setCategoryIds]=useState<string[]>([]);
  const [sellerIds,setSellerIds]=useState<string[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<PickProduct[]>([]);
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
  useEffect(()=>{void fetch("/api/v1/catalog/categories",{cache:"no-store"}).then(r=>r.json()).then(d=>setCategories(d.items??d.categories??[])).catch(()=>undefined);},[]);
  // Product search (live products) for "Specific products".
  useEffect(()=>{
    const q=query.trim();
    if(q.length<2){setResults([]);return;}
    const t=setTimeout(()=>{void fetch(`/api/v1/catalog/products?status=LIVE&q=${encodeURIComponent(q)}`,{cache:"no-store"}).then(r=>r.json()).then(d=>setResults((d.items??[]).slice(0,8))).catch(()=>setResults([]));},250);
    return ()=>clearTimeout(t);
  },[query]);
  // A single seller's coupon covers that seller's products: fill the seller from the chosen products.
  useEffect(()=>{
    if(f.fundingType!=="SELLER"||!picked.length)return;
    const ids=[...new Set(picked.map(x=>x.sellerId))];
    if(ids.length===1&&f.sellerId!==ids[0])setF(v=>({...v,sellerId:ids[0]!}));
  },[picked,f.fundingType,f.sellerId]);
  const pct=f.discountType==="PERCENTAGE"?Number(f.discountValue)||0:0;
  const mixedSellers=f.fundingType==="SELLER"&&new Set(picked.map(x=>x.sellerId)).size>1;

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setMessage("");
    try{
      if(f.fundingType==="SELLER"&&!f.sellerId) throw new Error("Select the seller who funds this coupon.");
      if(scopeMode==="PRODUCTS"&&!picked.length) throw new Error("Add at least one product, or choose All products.");
      if(scopeMode==="CATEGORIES"&&!categoryIds.length) throw new Error("Choose at least one category.");
      if(scopeMode==="SELLERS"&&!sellerIds.length) throw new Error("Choose at least one seller.");
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
        scope:{productIds:scopeMode==="PRODUCTS"?picked.map(x=>x.id):[],categoryIds:scopeMode==="CATEGORIES"?categoryIds:[],sellerIds:scopeMode==="SELLERS"?sellerIds:[]},
      };
      const r=await fetch("/api/v1/coupons",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message??"Create failed");
      setItems(x=>[d.coupon,...x]); setMessage(`Coupon created · ${d.coupon?.appliesTo??"All products"}`); setWarnings(d.warnings??[]);
      setF({...f,code:"",title:"",description:"",discountValue:f.discountValue});
    }catch(e){setMessage(e instanceof Error?e.message:"Something went wrong");}
    finally{setBusy(false);}
  }

  async function remove(c:Coupon){
    const used=c.usageCount>0;
    if(!confirm(used?`Delete ${c.code}?\n\nIt was used on ${c.usageCount} order${c.usageCount===1?"":"s"}, so it will be switched off and removed from this list, but kept in the background for those orders. The code can't be reused.`:`Delete ${c.code} permanently?`))return;
    const r=await fetch("/api/v1/coupons/"+c.id,{method:"DELETE"});
    const d=await r.json().catch(()=>null);
    if(!r.ok){setMessage(d?.error?.message??"Delete failed");return;}
    setItems(x=>x.filter(v=>v.id!==c.id));
    setMessage(d.result==="ARCHIVED"?`${c.code} deleted (kept for its ${d.orders} order${d.orders===1?"":"s"}).`:`${c.code} deleted.`);
  }

  async function toggle(c:Coupon){
    const r=await fetch("/api/v1/coupons/"+c.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({isActive:!c.isActive})});
    const d=await r.json();
    if(r.ok) setItems(x=>x.map(v=>v.id===c.id?{...v,...d.coupon}:v)); else setMessage(d?.error?.message??"Update failed");
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
        <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-500">Applies to</legend>
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            {([["ALL","All products"],["PRODUCTS","Specific products"],["CATEGORIES","Categories"],["SELLERS","Sellers"]] as const).map(([k,l])=><label key={k} className={"flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 "+(scopeMode===k?"bg-slate-950 text-white ring-slate-950":"ring-slate-200 hover:ring-slate-400")}><input type="radio" className="sr-only" name="scope" checked={scopeMode===k} onChange={()=>setScopeMode(k)}/>{l}</label>)}
          </div>
          {scopeMode==="PRODUCTS"?<div className="space-y-2">
            {picked.length?<ul className="space-y-1.5">{picked.map(x=><li key={x.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{x.title}</span><span className="block text-[11px] text-slate-500">{x.sellerName} · {x.couponMaxDiscountPct?`allows coupons up to ${x.couponMaxDiscountPct}%`:"not in seller-paid coupons"}</span>
                {f.fundingType==="SELLERS"&&pct>x.couponMaxDiscountPct?<span className="block text-[11px] font-semibold text-amber-700">Won&apos;t apply: seller allows {x.couponMaxDiscountPct}% (coupon is {pct}%)</span>:null}</span>
              <button type="button" aria-label={`Remove ${x.title}`} onClick={()=>setPicked(v=>v.filter(y=>y.id!==x.id))} className="shrink-0 text-xs font-semibold text-red-600">Remove</button>
            </li>)}</ul>:null}
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products by name or SKU (e.g. Gallardo)" className="w-full rounded-lg border p-2.5 text-sm"/>
            {results.length?<ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">{results.map(x=>{const on=picked.some(y=>y.id===x.id);return <li key={x.id}><button type="button" disabled={on} onClick={()=>{setPicked(v=>[...v,x]);setQuery("");}} className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"><span className="min-w-0"><span className="block truncate">{x.title}</span><span className="block text-[11px] text-slate-500">{x.sellerName}</span></span><span className="shrink-0 text-xs font-semibold text-brand-700">{on?"Added":"+ Add"}</span></button></li>;})}</ul>:null}
            {mixedSellers?<p className="text-[11px] font-semibold text-red-600">&ldquo;One seller pays&rdquo; can only cover one seller&apos;s products.</p>:null}
          </div>:null}
          {scopeMode==="CATEGORIES"?<div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto text-sm">{categories.map(c=><label key={c.id} className="flex items-center gap-2"><input type="checkbox" checked={categoryIds.includes(c.id)} onChange={e=>setCategoryIds(v=>e.target.checked?[...v,c.id]:v.filter(x=>x!==c.id))}/>{c.parentId?"↳ ":""}{c.name}</label>)}</div>:null}
          {scopeMode==="SELLERS"?<div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto text-sm">{sellers.map(x=><label key={x.id} className="flex items-center gap-2"><input type="checkbox" checked={sellerIds.includes(x.id)} onChange={e=>setSellerIds(v=>e.target.checked?[...v,x.id]:v.filter(y=>y!==x.id))}/>{x.storeName}</label>)}</div>:null}
        </fieldset>
        <div className={"grid gap-3 " + (f.fundingType==="SELLER" ? "grid-cols-2" : "grid-cols-1")}>
          <select className="rounded-lg border p-2.5" aria-label="Who pays for the discount" value={f.fundingType} onChange={e=>setF({...f,fundingType:e.target.value})}><option value="AZADIMART">AzadiMart pays</option><option value="SELLERS">Paid by sellers (products that allow it)</option><option value="SELLER">One seller pays (their own coupon)</option></select>
          {f.fundingType==="SELLER"?<select className="rounded-lg border p-2.5" value={f.sellerId} onChange={e=>setF({...f,sellerId:e.target.value})}><option value="">Select seller</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.storeName}</option>)}</select>:null}
        </div>
        {f.fundingType==="SELLERS"?<p className="rounded-lg bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-900">Applies only to products whose seller allows at least this much off (sellers set this per product). The discount comes out of each seller&apos;s payout. It shows on those product pages only. {f.discountType==="FIXED"?"Fixed amounts are capped per product at the seller's allowed %.":""}</p>:null}
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.firstOrderOnly} onChange={e=>setF({...f,firstOrderOnly:e.target.checked})}/> First order only</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.stackable} onChange={e=>setF({...f,stackable:e.target.checked})}/> Stackable</label>
        </div>
        <button disabled={busy} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?"Creating…":"Create coupon"}</button>
        <p role="status" className="text-xs text-slate-500">{message}</p>
        {warnings.length?<ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{warnings.map(w=><li key={w}>{w}</li>)}</ul>:null}
      </form>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Existing coupons</h2><span className="text-xs text-slate-500">{items.length}</span></div>
        <div className="mt-4 space-y-3">
          {items.length===0?<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No coupons yet.</div>:items.map(c=><div key={c.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-950 px-2 py-1 font-mono text-xs font-bold text-white">{c.code}</span><b className="text-sm">{c.title}</b><span className={"rounded-full px-2 py-1 text-[11px] "+(c.isActive?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{c.isActive?"Active":"Paused"}</span></div><p className="mt-1 text-xs text-slate-500">{c.discountType==="PERCENTAGE"?c.discountValue+"% off":c.discountType==="FIXED"?money(c.discountValue)+" off":"Free shipping"} · min {money(c.minimumOrderPaise)} · {c.fundingType==="SELLER"?"One seller pays":c.fundingType==="SELLERS"?"Paid by sellers (where allowed)":"AzadiMart pays"} · used {c.usageCount}{c.usageLimit?" / "+c.usageLimit:""}</p><p className="mt-0.5 text-xs font-medium text-slate-700">{c.appliesTo??"All products"}</p></div>
            <div className="flex shrink-0 gap-2">
              <button onClick={()=>toggle(c)} className="rounded-lg border px-3 py-2 text-xs font-semibold">{c.isActive?"Pause":"Activate"}</button>
              <button onClick={()=>void remove(c)} aria-label={`Delete ${c.code}`} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
            </div>
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}
