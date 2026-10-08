"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Product = { id:string;title:string;status:string;slug:string;createdAt:string;coverImageUrl:string|null;pricePaise:number|null;available:number };
const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});
const statusLabel:Record<string,string>={DRAFT:"Draft",PENDING_QC:"QC review",QC_REJECTED:"Needs changes",PENDING_ADMIN_APPROVAL:"Admin approval",LIVE:"Live",UNLISTED:"Unlisted",ARCHIVED:"Archived"};

export default function ProductList(){
  const [items,setItems]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [action,setAction]=useState<string|null>(null);

  async function load(){
    setLoading(true);setError("");
    try{const response=await fetch("/api/v1/products",{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to load products.");setItems(body.products??[]);}
    catch(err){setError(err instanceof Error?err.message:"Unable to load products.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load()},[]);

  async function submit(productId:string){
    setAction(productId);setError("");
    try{const response=await fetch("/api/v1/qc-submissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId})});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"QC submission failed.");await load();}
    catch(err){setError(err instanceof Error?err.message:"QC submission failed.");}
    finally{setAction(null);}
  }

  return <section className="mt-7 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    {error?<div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>:null}
    {loading?<div className="p-8 text-sm text-slate-500">Loading catalog…</div>:items.length===0?<div className="p-10 text-center"><p className="text-xl font-black">No products yet.</p><p className="mt-2 text-sm text-slate-500">Create your first product draft and send it through QC.</p><Link href="/products/new" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Create product</Link></div>:
      <div className="divide-y divide-slate-100">{items.map(product=><div key={product.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 bg-cover bg-center" style={product.coverImageUrl?{backgroundImage:`url("${product.coverImageUrl}")`}:undefined} role="img" aria-label={product.coverImageUrl?product.title:"No image"}/><div className="min-w-0"><p className="truncate font-bold">{product.title}</p><p className="mt-1 text-xs text-slate-500">{product.pricePaise!==null?money(product.pricePaise):"No price"} · <span className={product.available===0?"font-semibold text-red-600":product.available<=5?"font-semibold text-amber-700":""}>{product.available===0?"Out of stock":product.available+" in stock"}</span></p><p className="mt-0.5 text-xs text-slate-400">Added {new Date(product.createdAt).toLocaleDateString("en-IN")}</p></div></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{statusLabel[product.status]??product.status}</span>{product.status!=="ARCHIVED"?<Link href={"/products/"+product.id+"/aplus"} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:border-slate-900">A+ content</Link>:null}{(product.status==="DRAFT"||product.status==="QC_REJECTED")?<button type="button" disabled={action===product.id} onClick={()=>void submit(product.id)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{action===product.id?"Submitting…":"Submit for QC"}</button>:null}</div></div>)}</div>}
  </section>;
}
