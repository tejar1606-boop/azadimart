"use client";

import { useEffect, useState } from "react";

type NavItem = { label:string; href:string; isActive:boolean; position?:number };

export default function NavigationEditor(){
  const [items,setItems]=useState<NavItem[]>([]);
  const [status,setStatus]=useState("Loading…");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{fetch("/api/v1/online-store/navigation",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d?.error?.message??"Could not load navigation");setItems(d.navigation??[]);setStatus("Ready")}).catch(e=>setStatus(e.message));},[]);

  const update=(index:number,key:keyof NavItem,value:string|boolean)=>setItems(x=>x.map((item,i)=>i===index?{...item,[key]:value}:item));
  const move=(index:number,delta:number)=>{const target=index+delta;if(target<0||target>=items.length)return;const next=[...items],a=next[index],b=next[target];if(!a||!b)return;next[index]=b;next[target]=a;setItems(next)};
  async function save(){setBusy(true);setStatus("Saving…");try{const r=await fetch("/api/v1/online-store/navigation",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({items:items.map(({label,href,isActive})=>({label,href,isActive}))})});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message??"Save failed");setItems(d.navigation);setStatus("Navigation saved")}catch(e){setStatus(e instanceof Error?e.message:"Something went wrong")}finally{setBusy(false)}}

  return <div className="rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Main navigation</p><p className="text-xs text-slate-500">Edit the header links shown on the customer storefront.</p></div><button disabled={busy} onClick={save} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save navigation</button></div>
    <div className="mt-4 space-y-3">
      {items.map((item,index)=><div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className="rounded-lg border p-2.5 text-sm" aria-label={"Label "+(index+1)} value={item.label} onChange={e=>update(index,"label",e.target.value)}/>
        <input className="rounded-lg border p-2.5 text-sm" aria-label={"Link "+(index+1)} value={item.href} onChange={e=>update(index,"href",e.target.value)}/>
        <div className="flex gap-2"><button onClick={()=>move(index,-1)} className="rounded-md border px-3 py-2 text-xs">↑</button><button onClick={()=>move(index,1)} className="rounded-md border px-3 py-2 text-xs">↓</button><button onClick={()=>setItems(x=>x.filter((_,i)=>i!==index))} className="rounded-md border border-red-200 px-3 py-2 text-xs text-red-600">Remove</button></div>
        <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-3"><input type="checkbox" checked={item.isActive} onChange={e=>update(index,"isActive",e.target.checked)}/> Visible</label>
      </div>)}
      <button onClick={()=>setItems(x=>[...x,{label:"New link",href:"/",isActive:true}])} className="w-full rounded-xl border border-dashed p-3 text-sm font-semibold">+ Add navigation item</button>
      <p role="status" className="text-xs text-slate-500">{status}</p>
    </div>
  </div>;
}