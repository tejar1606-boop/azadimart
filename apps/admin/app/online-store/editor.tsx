
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_HOME_SECTIONS, SECTION_TYPES, type ThemeSectionDraft } from "@azadimart/shared";
import NavigationEditor from "./navigation-editor";

type Row = ThemeSectionDraft & { id:string };

const LABELS: Record<string,string> = {
  hero:"Hero banner", category_grid:"Category grid", featured_products:"Featured products",
  sales_coupons:"Sales coupons", image_banner:"Image + text banner", rich_text:"Rich text",
  video:"Video", newsletter:"Newsletter",
};

function defaults(type:string){ return DEFAULT_HOME_SECTIONS.find((s)=>s.type===type)?.settings ?? {heading:LABELS[type] ?? "New section"}; }
function val(s:Row,key:string){ return String(s.settings[key] ?? ""); }
function setVal(s:Row,key:string,value:unknown):Row{ return {...s,settings:{...s.settings,[key]:value}}; }

export default function OnlineStoreEditor(){
  const [themeId,setThemeId]=useState("");
  const [sections,setSections]=useState<Row[]>([]);
  const [themeSettings,setThemeSettings]=useState<Record<string,unknown>>({});
  const [message,setMessage]=useState("Loading…");
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/v1/online-store/homepage",{cache:"no-store"});
    const d=await r.json();
    if(!r.ok) throw new Error(d?.error?.message ?? "Could not load homepage");
    setThemeId(d.theme.id); setThemeSettings(d.theme.settings ?? {});
    setSections(d.sections.map((s)=>({id:s.id,type:s.type,position:s.position,isVisible:s.isVisible,settings:s.settings})));
    setMessage(d.theme.status==="PUBLISHED" ? "Published" : "Draft");
  }

  useEffect(()=>{ load().catch((e)=>setMessage(e.message)); },[]);

  function move(i:number,delta:number){
    const j=i+delta; if(j<0 || j>=sections.length) return;
    const next=[...sections]; const current=next[i]; const target=next[j]; if(!current || !target) return; next[i]=target; next[j]=current; setSections(next);
  }
  function add(type:string){ setSections((s)=>[...s,{id:"new-"+crypto.randomUUID(),type,position:s.length,isVisible:true,settings:defaults(type)}]); }
  function remove(i:number){ setSections((s)=>s.filter((_,idx)=>idx!==i)); }

  async function save(publish:boolean){
    setBusy(true); setMessage(publish ? "Publishing…" : "Saving…");
    try{
      const ordered=sections.map((s,i)=>({...s,position:i}));
      const r=await fetch("/api/v1/online-store/homepage",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({sections:ordered,themeSettings})});
      const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message ?? "Save failed");
      if(publish){
        const p=await fetch("/api/v1/online-store/publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({themeId,message:"Homepage published"})});
        const pd=await p.json(); if(!p.ok) throw new Error(pd?.error?.message ?? "Publish failed");
        setMessage("Published successfully");
      }else setMessage("Draft saved");
    }catch(e){setMessage(e instanceof Error ? e.message : "Something went wrong");}
    finally{setBusy(false);}
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Store builder</p><h1 className="mt-1 text-2xl font-bold">Homepage</h1><p className="mt-1 text-sm text-slate-500">Edit, preview, save and publish without a code deploy.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">{message}</span><button disabled={busy} onClick={()=>save(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Save draft</button><button disabled={busy} onClick={()=>save(true)} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish</button></div>
    </header>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-3">
        {sections.map((s,i)=><article key={s.id} className={"rounded-2xl border bg-white p-4 shadow-sm "+(s.isVisible?"border-slate-200":"border-dashed border-slate-300 opacity-60")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white">{i+1}</span><div><h2 className="font-semibold">{LABELS[s.type] ?? s.type}</h2><p className="text-xs text-slate-500">{s.type}</p></div></div>
            <div className="flex flex-wrap gap-2"><button onClick={()=>move(i,-1)} className="rounded-md border px-2.5 py-1.5 text-xs">↑</button><button onClick={()=>move(i,1)} className="rounded-md border px-2.5 py-1.5 text-xs">↓</button><button onClick={()=>setSections(x=>x.map((v,idx)=>idx===i?{...v,isVisible:!v.isVisible}:v))} className="rounded-md border px-2.5 py-1.5 text-xs">{s.isVisible?"Hide":"Show"}</button><button onClick={()=>remove(i)} className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600">Remove</button></div>
          </div>
          <SectionFields section={s} onChange={(key,value)=>setSections(x=>x.map((v,idx)=>idx===i?setVal(v,key,value):v))}/>
        </article>)}

        <div className="rounded-2xl border border-dashed bg-slate-50 p-5"><p className="text-sm font-semibold">Add section</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{SECTION_TYPES.map((t)=><button key={t} onClick={()=>add(t)} className="rounded-lg border bg-white px-3 py-3 text-left text-xs font-semibold">{LABELS[t]}</button>)}</div></div>
      </section>

      <aside className="xl:sticky xl:top-6 xl:self-start space-y-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p><p className="font-semibold">Storefront</p></div><span className="text-xs text-slate-500">Responsive</span></div><div className="mt-4 overflow-hidden rounded-xl border bg-[#fbfaf7]">{sections.filter(s=>s.isVisible).map((s,i)=><Preview key={s.id} section={s}/>)}</div></div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-sm font-semibold">Theme settings</p><label className="mt-3 block text-sm font-medium">Brand accent<input className="mt-1 w-full rounded-lg border p-2.5" value={String(themeSettings.accent ?? "#F59E0B")} onChange={e=>setThemeSettings(x=>({...x,accent:e.target.value}))}/></label><label className="mt-3 block text-sm font-medium">Announcement<input className="mt-1 w-full rounded-lg border p-2.5" value={String(themeSettings.announcement ?? "")} onChange={e=>setThemeSettings(x=>({...x,announcement:e.target.value}))}/></label></div>
      </aside>
    </div>
    <NavigationEditor />
  </div>
}

function SectionFields({section,onChange}:{section:Row;onChange:(key:string,value:unknown)=>void}){
  const t=section.type;
  const common=["hero","image_banner","category_grid","featured_products","sales_coupons","newsletter","rich_text","video"].includes(t);
  if(!common) return null;
  return <div className="mt-4 grid gap-3 md:grid-cols-2">
    {t!=="category_grid" && <Field label="Heading"><input className="w-full rounded-lg border p-2.5" value={val(section,"heading")} onChange={e=>onChange("heading",e.target.value)}/></Field>}
    {t!=="hero" && t!=="image_banner" && <Field label="Subtitle"><input className="w-full rounded-lg border p-2.5" value={val(section,"subtitle")} onChange={e=>onChange("subtitle",e.target.value)}/></Field>}
    {(t==="hero"||t==="image_banner") && <><Field label="Eyebrow"><input className="w-full rounded-lg border p-2.5" value={val(section,"eyebrow")} onChange={e=>onChange("eyebrow",e.target.value)}/></Field><Field label="Heading"><input className="w-full rounded-lg border p-2.5" value={val(section,"heading")} onChange={e=>onChange("heading",e.target.value)}/></Field><Field label="Description" wide><textarea className="min-h-24 w-full rounded-lg border p-2.5" value={val(section,"description")} onChange={e=>onChange("description",e.target.value)}/></Field><Field label="Button label"><input className="w-full rounded-lg border p-2.5" value={val(section,t==="hero"?"primaryLabel":"buttonLabel")} onChange={e=>onChange(t==="hero"?"primaryLabel":"buttonLabel",e.target.value)}/></Field><Field label="Button link"><input className="w-full rounded-lg border p-2.5" value={val(section,t==="hero"?"primaryHref":"buttonHref")} onChange={e=>onChange(t==="hero"?"primaryHref":"buttonHref",e.target.value)}/></Field><Field label="Image URL" wide><input className="w-full rounded-lg border p-2.5" placeholder="CDN/object-storage URL" value={val(section,t==="hero"?"desktopImageUrl":"imageUrl")} onChange={e=>onChange(t==="hero"?"desktopImageUrl":"imageUrl",e.target.value)}/></Field></>}
    {t==="category_grid" && <Field label="Categories (one per line)" wide><textarea className="min-h-28 w-full rounded-lg border p-2.5" value={Array.isArray(section.settings.categories)?section.settings.categories.join("\\n"):""} onChange={e=>onChange("categories",e.target.value.split("\\n").map(v=>v.trim()).filter(Boolean))}/></Field>}
    {(t==="featured_products"||t==="sales_coupons") && <Field label="Items to show"><input type="number" min="1" max="24" className="w-full rounded-lg border p-2.5" value={String(section.settings.limit ?? 8)} onChange={e=>onChange("limit",Number(e.target.value))}/></Field>}
    {t==="newsletter" && <Field label="Button label"><input className="w-full rounded-lg border p-2.5" value={val(section,"buttonLabel")} onChange={e=>onChange("buttonLabel",e.target.value)}/></Field>}
    {t==="video" && <Field label="Video URL" wide><input className="w-full rounded-lg border p-2.5" value={val(section,"videoUrl")} onChange={e=>onChange("videoUrl",e.target.value)}/></Field>}
  </div>
}

function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={"text-sm font-medium "+(wide?"md:col-span-2":"")}>{label}{children}</label>}

function Preview({section}:{section:Row}){
  const s=section.settings; const heading=String(s.heading ?? LABELS[section.type] ?? section.type);
  if(section.type==="hero") return <div className="min-h-44 bg-slate-950 p-5 text-white"><p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">{String(s.eyebrow??"Made for India")}</p><h3 className="mt-2 text-2xl font-bold leading-tight">{heading}</h3><p className="mt-2 text-xs text-slate-300">{String(s.description??"")}</p><button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-950">{String(s.primaryLabel??"Shop now")}</button></div>;
  if(section.type==="category_grid") return <div className="bg-white p-4"><h3 className="text-sm font-bold">{String(s.heading??"Shop by category")}</h3><p className="text-[11px] text-slate-500">{String(s.subtitle??"")}</p><div className="mt-3 grid grid-cols-2 gap-2">{(Array.isArray(s.categories)?s.categories:[]).slice(0,4).map((c:unknown)=><div key={String(c)} className="rounded-lg bg-slate-100 p-3 text-[11px] font-semibold">{String(c)}</div>)}</div></div>;
  if(section.type==="sales_coupons") return <div className="bg-amber-50 p-4"><h3 className="text-sm font-bold">{heading}</h3><div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-white p-3 text-xs"><b>WELCOME10</b><span className="ml-2 text-slate-500">10% off</span></div></div>;
  if(section.type==="newsletter") return <div className="bg-slate-900 p-5 text-white"><h3 className="text-lg font-bold">{heading}</h3><p className="mt-1 text-xs text-slate-300">{String(s.description??"")}</p><div className="mt-3 h-9 rounded-lg bg-white/10"/></div>;
  return <div className="border-b bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-slate-500">{String(s.eyebrow??"")}</p><h3 className="mt-1 text-lg font-bold">{heading}</h3><p className="mt-1 text-xs text-slate-500">{String(s.description??s.subtitle??"")}</p></div>;
}
