"use client";

import { useState } from "react";

export default function CouponCard({coupon}:{coupon:{code:string;title:string;discountType:"PERCENTAGE"|"FIXED"|"FREE_SHIPPING";discountValue:number;minimumOrderPaise:number}}){
  const [copied,setCopied]=useState(false);
  const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});
  const label=coupon.discountType==="PERCENTAGE"?coupon.discountValue+"% OFF":coupon.discountType==="FIXED"?money(coupon.discountValue)+" OFF":"FREE SHIPPING";
  async function copy(){try{await navigator.clipboard.writeText(coupon.code);setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{setCopied(false);}}
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white p-4">
    <div><div className="flex items-center gap-2"><span className="rounded-md border border-dashed px-2 py-1 font-mono text-xs font-bold">{coupon.code}</span><span className="text-sm font-bold">{label}</span></div><p className="mt-1 text-xs text-slate-500">{coupon.title}</p></div>
    <button type="button" onClick={copy} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">{copied?"Copied":"Copy"}</button>
  </div>;
}