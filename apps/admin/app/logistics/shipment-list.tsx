"use client";

import { useEffect, useState } from "react";

type Shipment={id:string;orderId:string;orderNumber:string;sellerId:string;sellerName:string;status:string;awb:string|null;providerShipmentId:string|null;updatedAt:string};

export default function ShipmentList(){
  const [items,setItems]=useState<Shipment[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{void (async()=>{try{
    const response=await fetch("/api/v1/shipments",{cache:"no-store"});
    const body=await response.json();
    if(!response.ok)throw new Error(body?.error?.message??"Unable to load shipments.");
    setItems(body.items??[]);
  }catch(err){setError(err instanceof Error?err.message:"Unable to load shipments.");}
  finally{setLoading(false);}})();},[]);

  if(loading)return <div className="mt-7 h-72 animate-pulse rounded-[2rem] bg-white"/>;
  if(error)return <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if(!items.length)return <div className="mt-7 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-black">No shipments yet.</p><p className="mt-2 text-sm text-slate-500">Seller-created shipments will appear here for operations monitoring.</p></div>;

  return <div className="mt-7 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    <div className="divide-y divide-slate-100">
      {items.map(item=><article key={item.id} className="p-5 sm:p-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="font-black">{item.orderNumber}</p><p className="mt-1 text-xs text-slate-400">{item.sellerName} · Updated {new Date(item.updatedAt).toLocaleString("en-IN")}</p></div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.status.replaceAll("_"," ")}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Shipment</p><p className="mt-1 break-all text-sm font-semibold">{item.providerShipmentId??item.id}</p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">AWB</p><p className="mt-1 text-sm font-semibold">{item.awb??"Pending carrier assignment"}</p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Seller</p><p className="mt-1 text-sm font-semibold">{item.sellerName}</p></div>
        </div>
      </article>)}
    </div>
  </div>;
}
