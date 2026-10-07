"use client";
import { useEffect, useState } from "react";

type Order={id:string;orderNumber:string;status:string;grandTotalPaise:number;discountPaise:number;couponCode:string|null;createdAt:string;productTitle:string;sku:string;quantity:number;unitPricePaise:number;paymentStatus:string|null};
const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});

export default function OrderList(){
  const [items,setItems]=useState<Order[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{void (async()=>{try{const response=await fetch("/api/v1/orders",{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to load orders.");setItems(body.items??[]);}catch(err){setError(err instanceof Error?err.message:"Unable to load orders.");}finally{setLoading(false);}})();},[]);
  if(loading)return <div className="mt-7 h-72 animate-pulse rounded-[2rem] bg-white"/>;
  if(error)return <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if(items.length===0)return <div className="mt-7 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-black">No seller orders yet.</p><p className="mt-2 text-sm text-slate-500">Orders containing your products will appear here after checkout.</p></div>;
  return <div className="mt-7 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{items.map(item=><article key={item.orderItemId} className="p-5 sm:p-7"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-black">{item.orderNumber}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString("en-IN")}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.status.replaceAll("_"," ")}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{item.paymentStatus??"PENDING"}</span></div></div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="text-sm font-black">{item.productTitle}</p><p className="mt-1 text-xs text-slate-400">SKU {item.sku} · Qty {item.quantity}</p></div><p className="text-sm text-slate-500">{money(item.unitPricePaise)} each</p><p className="text-lg font-black">{money(item.unitPricePaise*item.quantity)}</p></div><p className="mt-4 text-xs text-slate-400">{item.couponCode?"Customer used coupon "+item.couponCode:"No coupon"} · Order total {money(item.grandTotalPaise)}</p></article>)}</div></div>;
}