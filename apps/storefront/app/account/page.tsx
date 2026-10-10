"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Order={id:string;orderNumber:string;status:string;grandTotalPaise:number;discountPaise:number;couponCode:string|null;createdAt:string;paymentStatus:string|null;firstItem:{title:string;quantity:number;unitPricePaise:number}|null};
const money=(paise:number)=>"₹"+(paise/100).toLocaleString("en-IN",{maximumFractionDigits:0});

export default function AccountPage(){
  const [orders,setOrders]=useState<Order[]>([]);
  const [loading,setLoading]=useState(true);
  const [signedOut,setSignedOut]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    void (async()=>{
      try{
        const session=await fetch("/api/auth/session",{cache:"no-store"});
        if(session.status===401){setSignedOut(true);return;}
        const sessionBody=await session.json();
        if(!session.ok||sessionBody.role!=="CUSTOMER"){setSignedOut(true);return;}
        const response=await fetch("/api/v1/orders",{cache:"no-store"});
        const body=await response.json();
        if(!response.ok)throw new Error(body?.error?.message??"Unable to load your orders.");
        setOrders(body.items??[]);
      }catch(err){setError(err instanceof Error?err.message:"Unable to load your account.");}
      finally{setLoading(false);}
    })();
  },[]);

  if(signedOut)return <main className="min-h-[60vh] bg-canvas px-4 py-12 sm:px-6"><div className="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">My account</p><h1 className="mt-2 text-3xl font-bold">Sign in to continue</h1><p className="mt-3 text-sm leading-6 text-slate-500">Your orders and delivery details are available after signing in.</p><Link href="/login" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Sign in</Link></div></main>;

  return <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12"><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">My account</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Your orders.</h1><p className="mt-2 text-sm text-slate-500">Track your AzadiMart purchases and payment status.</p></div><Link href="/products" className="text-sm font-bold text-slate-500">Continue shopping →</Link></div>
    {error?<div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}
    {loading?<div className="mt-7 grid gap-3"><div className="h-32 animate-pulse rounded-[2rem] bg-white"/><div className="h-32 animate-pulse rounded-[2rem] bg-white"/></div>:orders.length===0?<div className="mt-7 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-bold">No orders yet.</p><p className="mt-2 text-sm text-slate-500">Your completed purchases will appear here.</p><Link href="/products" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Browse products</Link></div>:<section className="mt-7 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">
      {orders.map(order=><article key={order.id} className="p-5 sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><Link href={"/account/orders/"+order.id} className="font-bold underline-offset-4 hover:underline">{order.orderNumber}</Link><p className="mt-1 text-xs text-slate-400">{new Date(order.createdAt).toLocaleString("en-IN")}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{order.status.replaceAll("_"," ")}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{order.paymentStatus??"PENDING"}</span></div></div>{order.firstItem?<div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4"><p className="min-w-0 truncate text-sm font-semibold">{order.firstItem.title}{order.firstItem.quantity>1?" × "+order.firstItem.quantity:""}</p><p className="shrink-0 text-base font-bold">{money(order.grandTotalPaise)}</p></div>:null}<p className="mt-3 text-xs text-slate-400">{order.discountPaise>0?"Saved "+money(order.discountPaise):"No discount"}{order.couponCode?" · "+order.couponCode:""}</p></article>)}
    </div></section>}
  </div></main>;
}