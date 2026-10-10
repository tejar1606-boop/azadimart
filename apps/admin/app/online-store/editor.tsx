
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_HOME_SECTIONS, SECTION_TYPES, type ThemeSectionDraft } from "@azadimart/shared";
import BannerRowField, { type RowBanner } from "./banner-row-field";
import HeroSlidesField, { SLIDE_SECONDS_DEFAULT, slidesFromSettings } from "./hero-slides-field";
import MediaField from "./media-field";
import NavigationEditor from "./navigation-editor";
import ShowcaseField from "./showcase-field";
import SeoFields from "../_components/seo-fields";

type Row = ThemeSectionDraft & { id:string };
type HomepageSectionResponse = { id:string; type:string; position:number; isVisible:boolean; settings:Record<string,unknown> };

const LABELS: Record<string,string> = {
  hero:"Hero banner", marquee:"Scrolling highlights strip", promo_banner:"Promo banner", banner_row:"Banner row (1–3 banners)", category_showcase:"Top category banner", category_grid:"Category grid", featured_products:"Featured products",
  sales_coupons:"Sales coupons", image_banner:"Image + text banner", trust_strip:"Trust & value strip", rich_text:"Rich text",
  video:"Video", seller_cta:"Seller callout", newsletter:"Newsletter",
};

function defaults(type:string){
  // Mid-page banner rows are usually a desktop feature (like Meesho); start them desktop-only with two empty banners.
  if(type==="banner_row") return {heading:"",showOn:"desktop",banners:[{},{}]};
  if(type==="category_showcase") return {theme:"saffron",buttonLabel:"View all",showOn:"all"};
  return DEFAULT_HOME_SECTIONS.find((s)=>s.type===type)?.settings ?? {heading:LABELS[type] ?? "New section"};
}
const SHOW_ON_LABEL: Record<string,string> = { all:"All devices", desktop:"Desktop only", mobile:"Mobile only" };
function val(s:Row,key:string){ return String(s.settings[key] ?? ""); }
/** A value, or an updater applied to the latest settings (avoids lost updates when async uploads finish together). */
type SettingValue = unknown | ((settings:Record<string,unknown>)=>unknown);
function setVal(s:Row,key:string,value:SettingValue):Row{ const next = typeof value==="function" ? (value as (settings:Record<string,unknown>)=>unknown)(s.settings) : value; return {...s,settings:{...s.settings,[key]:next}}; }

export default function OnlineStoreEditor(){
  const [themeId,setThemeId]=useState("");
  const [sections,setSections]=useState<Row[]>([]);
  const [themeSettings,setThemeSettings]=useState<Record<string,unknown>>({});
  const [message,setMessage]=useState("Loading…");
  const [device,setDevice]=useState<"desktop"|"phone">("desktop");
  const [activeId,setActiveId]=useState<string|null>(null);
  const previewRef=useRef<HTMLDivElement>(null);
  // Category names, so "Top category" previews show the real name.
  const [categoryNames,setCategoryNames]=useState<Record<string,string>>({});
  useEffect(()=>{ fetch("/api/v1/catalog/categories",{cache:"no-store"}).then(r=>r.json()).then(b=>setCategoryNames(Object.fromEntries(((b.items??[]) as Array<{id:string;name:string}>).map(c=>[c.id,c.name])))).catch(()=>undefined); },[]);
  // Bring the section being edited into view in the preview.
  useEffect(()=>{ if(!activeId) return; previewRef.current?.querySelector(`[data-preview="${activeId}"]`)?.scrollIntoView({block:"nearest",behavior:"smooth"}); },[activeId,device]);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/v1/online-store/homepage",{cache:"no-store"});
    const d=await r.json();
    if(!r.ok) throw new Error(d?.error?.message ?? "Could not load homepage");
    setThemeId(d.theme.id); setThemeSettings(d.theme.settings ?? {});
    setSections(d.sections.map((s: HomepageSectionResponse)=>({id:s.id,type:s.type,position:s.position,isVisible:s.isVisible,settings:s.settings})));
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

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-3">
        {sections.map((s,i)=><article key={s.id} onFocusCapture={()=>setActiveId(s.id)} onClick={()=>setActiveId(s.id)} className={"rounded-2xl border bg-white p-4 shadow-sm "+(s.isVisible?"border-slate-200":"border-dashed border-slate-300 opacity-60")+(activeId===s.id?" ring-2 ring-brand":"")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white">{i+1}</span><div><h2 className="flex flex-wrap items-center gap-2 font-semibold">{LABELS[s.type] ?? s.type}{s.settings.showOn==="desktop"||s.settings.showOn==="mobile" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{SHOW_ON_LABEL[String(s.settings.showOn)]}</span> : null}</h2><p className="text-xs text-slate-500">{s.type}</p></div></div>
            <div className="flex flex-wrap gap-2"><button onClick={()=>move(i,-1)} className="rounded-md border px-2.5 py-1.5 text-xs">↑</button><button onClick={()=>move(i,1)} className="rounded-md border px-2.5 py-1.5 text-xs">↓</button><button onClick={()=>setSections(x=>x.map((v,idx)=>idx===i?{...v,isVisible:!v.isVisible}:v))} className="rounded-md border px-2.5 py-1.5 text-xs">{s.isVisible?"Hide":"Show"}</button><button onClick={()=>remove(i)} className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600">Remove</button></div>
          </div>
          <label className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium">Show on
            <select className="rounded-lg border p-2 text-sm" value={String(s.settings.showOn ?? "all")} onChange={e=>setSections(x=>x.map((v,idx)=>idx===i?setVal(v,"showOn",e.target.value):v))}>
              {Object.entries(SHOW_ON_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
            <span className="text-xs font-normal text-slate-500">Desktop = screens 1024 px and wider (laptops, desktops).</span>
          </label>
          <SectionFields section={s} onChange={(key,value)=>setSections(x=>x.map((v,idx)=>idx===i?setVal(v,key,value):v))}/>
        </article>)}

        <div className="rounded-2xl border border-dashed bg-slate-50 p-5"><p className="text-sm font-semibold">Add section</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{SECTION_TYPES.map((t)=><button key={t} onClick={()=>add(t)} className="rounded-lg border bg-white px-3 py-3 text-left text-xs font-semibold">{LABELS[t]}</button>)}</div></div>
      </section>

      <aside className="xl:sticky xl:top-6 xl:self-start space-y-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p><p className="text-xs text-slate-500">Updates as you edit · click a section to find it</p></div>
            <div role="radiogroup" aria-label="Preview device" className="inline-flex rounded-full bg-slate-100 p-1">{(["desktop","phone"] as const).map(d=><button key={d} type="button" role="radio" aria-checked={device===d} onClick={()=>setDevice(d)} className={"rounded-full px-3 py-1 text-xs font-semibold "+(device===d?"bg-white shadow-sm":"text-slate-500")}>{d==="desktop"?"Desktop":"Phone"}</button>)}</div>
          </div>
          <div ref={previewRef} className={"mx-auto mt-4 max-h-[75vh] overflow-y-auto overflow-x-hidden rounded-xl border bg-[#fbfaf7] "+(device==="phone"?"w-[260px]":"w-full")}>
            {sections.filter(s=>s.isVisible && (s.settings.showOn!==(device==="phone"?"desktop":"mobile"))).map((s)=><div key={s.id} data-preview={s.id} onClick={()=>setActiveId(s.id)} className={"relative cursor-pointer "+(activeId===s.id?"outline outline-2 -outline-offset-2 outline-brand":"")}><Preview section={s} device={device} categoryName={categoryNames[String(s.settings.categoryId??"")]}/></div>)}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">{device==="phone"?"Phone view: mobile images where added; “Desktop only” sections hidden.":"Desktop view: “Mobile only” sections hidden."}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-sm font-semibold">Theme settings</p><label className="mt-3 block text-sm font-medium">Brand accent<input className="mt-1 w-full rounded-lg border p-2.5" value={String(themeSettings.accent ?? "#F59E0B")} onChange={e=>setThemeSettings(x=>({...x,accent:e.target.value}))}/></label><label className="mt-3 block text-sm font-medium">Announcement<input className="mt-1 w-full rounded-lg border p-2.5" value={String(themeSettings.announcement ?? "")} onChange={e=>setThemeSettings(x=>({...x,announcement:e.target.value}))}/></label></div>
        <HomepageSeo seo={(themeSettings.seo && typeof themeSettings.seo==="object" ? themeSettings.seo : {}) as Record<string,unknown>} onChange={(key,value)=>setThemeSettings(x=>({...x,seo:{...((x.seo && typeof x.seo==="object") ? x.seo as Record<string,unknown> : {}),[key]:value}}))}/>
      </aside>
    </div>
    <NavigationEditor />
  </div>
}

function SectionFields({section,onChange}:{section:Row;onChange:(key:string,value:SettingValue)=>void}){
  const t=section.type;
  const common=["hero","marquee","promo_banner","banner_row","category_showcase","image_banner","category_grid","trust_strip","featured_products","sales_coupons","seller_cta","newsletter","rich_text","video"].includes(t);
  if(!common) return null;
  return <div className="mt-4 grid gap-3 md:grid-cols-2">
    {t==="category_showcase" && <ShowcaseField settings={section.settings} onChange={onChange}/>}
    {t!=="category_grid" && t!=="marquee" && t!=="promo_banner" && t!=="banner_row" && t!=="category_showcase" && t!=="hero" && t!=="image_banner" && <Field label="Heading"><input className="w-full rounded-lg border p-2.5" value={val(section,"heading")} onChange={e=>onChange("heading",e.target.value)}/></Field>}
    {t==="banner_row" && <>
      <Field label="Heading above the banners (optional)" wide><input className="w-full rounded-lg border p-2.5" placeholder="e.g. Deals of the day" value={val(section,"heading")} onChange={e=>onChange("heading",e.target.value)}/></Field>
      <BannerRowField banners={Array.isArray(section.settings.banners)?section.settings.banners as RowBanner[]:[]} onChange={(update)=>onChange("banners",(settings:Record<string,unknown>)=>update(Array.isArray(settings.banners)?settings.banners as RowBanner[]:[]))}/>
      <p className="text-xs text-slate-500 md:col-span-2">Place this row between product sections with the ↑ ↓ arrows. Banners without an image are hidden on the store.</p>
    </>}
    {t!=="hero" && t!=="image_banner" && t!=="marquee" && t!=="promo_banner" && t!=="banner_row" && t!=="category_showcase" && <Field label="Subtitle"><input className="w-full rounded-lg border p-2.5" value={val(section,"subtitle")} onChange={e=>onChange("subtitle",e.target.value)}/></Field>}
    {t==="hero" && <>
      <HeroSlidesField slides={slidesFromSettings(section.settings)} onChange={(update)=>onChange("slides",(settings:Record<string,unknown>)=>update(slidesFromSettings(settings)))} slideSeconds={Number(section.settings.slideSeconds)||SLIDE_SECONDS_DEFAULT} onSecondsChange={(seconds)=>onChange("slideSeconds",seconds)}/>
      <details className="rounded-xl border border-slate-200 p-3 md:col-span-2" open={slidesFromSettings(section.settings).length===0}>
        <summary className="cursor-pointer text-sm font-semibold">Text banner <span className="font-normal text-slate-500">(only shown when there are no slides)</span></summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Eyebrow"><input className="w-full rounded-lg border p-2.5" value={val(section,"eyebrow")} onChange={e=>onChange("eyebrow",e.target.value)}/></Field>
          <Field label="Heading"><input className="w-full rounded-lg border p-2.5" value={val(section,"heading")} onChange={e=>onChange("heading",e.target.value)}/></Field>
          <Field label="Description" wide><textarea className="min-h-20 w-full rounded-lg border p-2.5" value={val(section,"description")} onChange={e=>onChange("description",e.target.value)}/></Field>
          <Field label="Button label"><input className="w-full rounded-lg border p-2.5" value={val(section,"primaryLabel")} onChange={e=>onChange("primaryLabel",e.target.value)}/></Field>
          <Field label="Button link"><input className="w-full rounded-lg border p-2.5" value={val(section,"primaryHref")} onChange={e=>onChange("primaryHref",e.target.value)}/></Field>
        </div>
      </details>
    </>}
    {t==="image_banner" && <><Field label="Eyebrow"><input className="w-full rounded-lg border p-2.5" value={val(section,"eyebrow")} onChange={e=>onChange("eyebrow",e.target.value)}/></Field><Field label="Heading"><input className="w-full rounded-lg border p-2.5" value={val(section,"heading")} onChange={e=>onChange("heading",e.target.value)}/></Field><Field label="Description" wide><textarea className="min-h-24 w-full rounded-lg border p-2.5" value={val(section,"description")} onChange={e=>onChange("description",e.target.value)}/></Field><Field label="Button label"><input className="w-full rounded-lg border p-2.5" value={val(section,"buttonLabel")} onChange={e=>onChange("buttonLabel",e.target.value)}/></Field><Field label="Button link"><input className="w-full rounded-lg border p-2.5" value={val(section,"buttonHref")} onChange={e=>onChange("buttonHref",e.target.value)}/></Field><MediaField kind="image" label="Side image (optional)" hint="1600 × 1200 px · replaces the icon tiles" value={val(section,"imageUrl")} onChange={v=>onChange("imageUrl",v)}/></>}
    {(t==="trust_strip"||t==="marquee") && <Field label="Items (one per line)" wide><textarea className="min-h-28 w-full rounded-lg border p-2.5" value={Array.isArray(section.settings.items)?section.settings.items.filter((v): v is string=>typeof v==="string").join("\n"):""} onChange={e=>onChange("items",e.target.value.split("\n").map(v=>v.trim()).filter(Boolean))}/></Field>}
    {t==="seller_cta" && <><Field label="Eyebrow"><input className="w-full rounded-lg border p-2.5" value={val(section,"eyebrow")} onChange={e=>onChange("eyebrow",e.target.value)}/></Field><Field label="Description"><textarea className="min-h-20 w-full rounded-lg border p-2.5" value={val(section,"description")} onChange={e=>onChange("description",e.target.value)}/></Field><Field label="Primary label"><input className="w-full rounded-lg border p-2.5" value={val(section,"primaryLabel")} onChange={e=>onChange("primaryLabel",e.target.value)}/></Field><Field label="Primary link"><input className="w-full rounded-lg border p-2.5" value={val(section,"primaryHref")} onChange={e=>onChange("primaryHref",e.target.value)}/></Field><Field label="Secondary label"><input className="w-full rounded-lg border p-2.5" value={val(section,"secondaryLabel")} onChange={e=>onChange("secondaryLabel",e.target.value)}/></Field><Field label="Secondary link"><input className="w-full rounded-lg border p-2.5" value={val(section,"secondaryHref")} onChange={e=>onChange("secondaryHref",e.target.value)}/></Field><MediaField kind="image" label="Background image (optional)" hint="2400 × 800 px · subject on the right" value={val(section,"imageUrl")} onChange={v=>onChange("imageUrl",v)}/></>}
    {t==="category_grid" && <Field label="Categories (one per line)" wide><textarea className="min-h-28 w-full rounded-lg border p-2.5" value={Array.isArray(section.settings.categories)?section.settings.categories.join("\n"):""} onChange={e=>onChange("categories",e.target.value.split("\n").map(v=>v.trim()).filter(Boolean))}/></Field>}
    {(t==="featured_products"||t==="sales_coupons") && <Field label="Items to show"><input type="number" min="1" max="24" className="w-full rounded-lg border p-2.5" value={String(section.settings.limit ?? 8)} onChange={e=>onChange("limit",Number(e.target.value))}/></Field>}
    {t==="newsletter" && <Field label="Button label"><input className="w-full rounded-lg border p-2.5" value={val(section,"buttonLabel")} onChange={e=>onChange("buttonLabel",e.target.value)}/></Field>}
    {t==="promo_banner" && <>
      <MediaField kind="image" label="Desktop banner" hint="1800 × 320 px" size={{width:1800,height:320}} value={val(section,"desktopImageUrl")} onChange={v=>onChange("desktopImageUrl",v)}/>
      <MediaField kind="image" label="Mobile banner" hint="800 × 329 px" size={{width:800,height:329}} value={val(section,"mobileImageUrl")} onChange={v=>onChange("mobileImageUrl",v)}/>
      <MediaField kind="video" label="Desktop video (optional)" hint="Same shape as 1800 × 320" value={val(section,"desktopVideoUrl")} onChange={v=>onChange("desktopVideoUrl",v)}/>
      <MediaField kind="video" label="Mobile video (optional)" hint="Same shape as 800 × 329" value={val(section,"mobileVideoUrl")} onChange={v=>onChange("mobileVideoUrl",v)}/>
      <Field label="Link (where the banner goes)"><input className="w-full rounded-lg border p-2.5" placeholder="/c/electronics-accessories" value={val(section,"href")} onChange={e=>onChange("href",e.target.value)}/></Field>
      <Field label="Alt text (describe the banner)"><input className="w-full rounded-lg border p-2.5" placeholder="e.g. Diwali sale — up to 40% off" value={val(section,"alt")} onChange={e=>onChange("alt",e.target.value)}/></Field>
      <p className="text-xs text-slate-500 md:col-span-2">Add as many promo banners as you like and drag them between sections with the arrows. A banner without a desktop image or video is hidden on the store. A video plays muted on loop, with the image shown while it loads.</p>
    </>}
    {t==="video" && <MediaField kind="video" label="Video" hint="16:9 works best" value={val(section,"videoUrl")} onChange={v=>onChange("videoUrl",v)}/>}
  </div>
}

function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={"text-sm font-medium "+(wide?"md:col-span-2":"")}>{label}{children}</label>}

const bg=(url:unknown)=>({backgroundImage:`url("${String(url).replace(/"/g,"")}")`});
const str2=(v:unknown)=>typeof v==="string"?v:"";

/** Hero preview: rotates through the real slides at the chosen speed. */
function HeroPreview({s,device}:{s:Record<string,unknown>;device:"desktop"|"phone"}){
  const slides=slidesFromSettings(s).filter(x=>x.desktopImageUrl||x.desktopVideoUrl);
  const [i,setI]=useState(0);
  const seconds=Number(s.slideSeconds)||SLIDE_SECONDS_DEFAULT;
  useEffect(()=>{ if(slides.length<2) return; const t=setTimeout(()=>setI(v=>(v+1)%slides.length),(slides[i%slides.length]?.seconds ?? seconds)*1000); return ()=>clearTimeout(t); },[i,slides.length,seconds,slides]);
  const phone=device==="phone";
  if(!slides.length) return <div className="bg-slate-950 p-5 text-white"><p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">{str2(s.eyebrow)||"Made for India"}</p><h3 className="mt-2 text-xl font-bold leading-tight">{str2(s.heading)||"Your heading"}</h3><p className="mt-2 text-xs text-slate-300">{str2(s.description)}</p><span className="mt-3 inline-block rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-950">{str2(s.primaryLabel)||"Shop now"}</span><p className="mt-3 text-[10px] text-slate-400">Text banner · add slides to show images</p></div>;
  const slide=slides[i%slides.length]!;
  const video=phone?(slide.mobileVideoUrl||(slide.mobileImageUrl?undefined:slide.desktopVideoUrl)):slide.desktopVideoUrl;
  const image=phone?(slide.mobileImageUrl||slide.desktopImageUrl):slide.desktopImageUrl;
  return <div className={"relative overflow-hidden bg-slate-200 "+(phone?"aspect-[4/5]":"aspect-[8/3]")}>
    {video?<video key={video} src={video} poster={image} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 bg-cover bg-center" style={bg(image)}/>}
    {slides.length>1?<div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1">{slides.map((_,k)=><span key={k} className={"h-1 rounded-full "+(k===i%slides.length?"w-4 bg-amber-400":"w-1 bg-white/80")}/>)}</div>:null}
    <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">Slide {i%slides.length+1}/{slides.length} · {slide.playFullVideo?"whole video":`${slide.seconds ?? seconds}s`}</span>
  </div>;
}

function Preview({section,device,categoryName}:{section:Row;device:"desktop"|"phone";categoryName?:string}){
  const s=section.settings; const heading=String(s.heading ?? LABELS[section.type] ?? section.type); const phone=device==="phone";
  if(section.type==="hero") return <HeroPreview s={s} device={device}/>;
  if(section.type==="category_grid") return <div className="bg-white p-4"><h3 className="text-sm font-bold">{String(s.heading??"Shop by category")}</h3><p className="text-[11px] text-slate-500">{String(s.subtitle??"")}</p><div className="mt-3 grid grid-cols-2 gap-2">{(Array.isArray(s.categories)?s.categories:[]).slice(0,4).map((c:unknown)=><div key={String(c)} className="rounded-lg bg-slate-100 p-3 text-[11px] font-semibold">{String(c)}</div>)}</div></div>;
  if(section.type==="promo_banner"){ const img=phone?(str2(s.mobileImageUrl)||str2(s.desktopImageUrl)):str2(s.desktopImageUrl); return img ? <div className="bg-white p-2"><div className={"w-full rounded bg-cover bg-center "+(phone&&s.mobileImageUrl?"aspect-[800/329]":"aspect-[1800/320]")} style={bg(img)}/></div> : <div className="grid aspect-[1800/320] place-items-center bg-slate-100 text-[11px] font-semibold text-slate-400">Promo banner · upload 1800 × 320</div>; }
  if(section.type==="banner_row"){
    const banners=(Array.isArray(s.banners)?s.banners:[]) as RowBanner[];
    const shape=banners.length<=1?"aspect-[4/1]":banners.length===2?"aspect-[2/1]":"aspect-[4/3]";
    return <div className="bg-white p-2">{s.heading?<p className="px-1 pb-1.5 text-xs font-bold">{String(s.heading)}</p>:null}<div className={"grid gap-1.5 "+(phone?"":banners.length===2?"grid-cols-2":banners.length>=3?"grid-cols-3":"")}>{(banners.length?banners:[{}]).slice(0,3).map((b,i)=>b.imageUrl?<div key={i} className={"w-full rounded bg-cover bg-center "+shape} style={bg(b.imageUrl)}/>:<div key={i} className={"grid place-items-center rounded bg-slate-100 text-[10px] font-semibold text-slate-400 "+shape}>Banner {i+1}</div>)}</div></div>;
  }
  if(section.type==="category_showcase"){
    const img=str2(s.imageUrl);
    const panel=<div className={"relative overflow-hidden p-3 text-white "+(img?"":"bg-gradient-to-br from-[#ffb366] to-brand-600")+(phone?" aspect-[16/10]":"")} style={img?bg(img):undefined}>{img?<span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"/>:null}<div className="relative"><p className="text-[8px] uppercase tracking-[0.18em] opacity-80">{str2(s.eyebrow)||"Top category"}</p><p className="mt-1 text-sm font-bold leading-tight">{str2(s.heading)||categoryName||"Choose a category"}</p><span className="mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-900">{str2(s.buttonLabel)||"View all"}</span></div></div>;
    return phone?<div className="bg-white">{panel}<div className="flex gap-1.5 overflow-hidden p-2">{Array.from({length:3}).map((_,i)=><div key={i} className="aspect-square w-1/3 shrink-0 rounded bg-slate-100"/>)}</div></div>:<div className="grid grid-cols-[38%_1fr] bg-white">{panel}<div className="grid grid-cols-3 gap-1.5 p-2">{Array.from({length:6}).map((_,i)=><div key={i} className="aspect-square rounded bg-slate-100"/>)}</div></div>;
  }
  if(section.type==="image_banner"){
    const img=str2(s.imageUrl);
    return <div className={"grid "+(phone?"":"grid-cols-2")}><div className="bg-gradient-to-br from-brand-500 to-brand-600 p-3 text-white"><p className="text-[8px] uppercase tracking-[0.16em] opacity-80">{str2(s.eyebrow)||"Why AzadiMart"}</p><p className="mt-1 text-sm font-bold leading-tight">{str2(s.heading)||"Shopping you can trust."}</p><span className="mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-900">{str2(s.buttonLabel)||"Start shopping"}</span></div>{img?<div className={"bg-cover bg-center "+(phone?"aspect-[4/3]":"min-h-24")} style={bg(img)}/>:<div className="grid grid-cols-2 gap-px bg-slate-200">{Array.from({length:4}).map((_,i)=><div key={i} className="min-h-10 bg-[#eff0f3]"/>)}</div>}</div>;
  }
  if(section.type==="marquee") return <div className="overflow-hidden bg-black px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-white">{(Array.isArray(s.items)&&s.items.length?s.items:["Cash on Delivery available","KYC-verified sellers","Easy 7-day returns"]).filter((v):v is string=>typeof v==="string").join("  ✦  ")}</div>;
  if(section.type==="trust_strip") return <div className="grid grid-cols-2 border-y bg-white p-3">{(Array.isArray(s.items)?s.items:[]).filter((v):v is string=>typeof v==="string").slice(0,4).map((item)=><div key={item} className="p-2 text-center text-[10px] font-semibold text-slate-700">{item}</div>)}</div>;
  if(section.type==="seller_cta"){ const img=str2(s.imageUrl); return <div className="relative overflow-hidden bg-[#0b2a5b] p-5 text-white">{img?<><div className="absolute inset-0 bg-cover bg-right" style={bg(img)}/><span className={"absolute inset-0 "+(phone?"bg-[#0b2a5b]/85":"bg-gradient-to-r from-[#0b2a5b] via-[#0b2a5b]/70 to-[#0b2a5b]/35")}/></>:null}<div className="relative"><p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">{str2(s.eyebrow)||"Built for ambitious sellers"}</p><h3 className="mt-2 text-lg font-bold">{str2(s.heading)||"Take your business online."}</h3><p className="mt-1 text-xs text-slate-300">{str2(s.description)}</p><span className="mt-3 inline-block rounded-full bg-[#e8892b] px-3 py-1 text-[10px] font-semibold">{str2(s.primaryLabel)||"Start selling"}</span></div></div>; }
  if(section.type==="sales_coupons") return <div className="bg-amber-50 p-4"><h3 className="text-sm font-bold">{heading}</h3><div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-white p-3 text-xs"><b>WELCOME10</b><span className="ml-2 text-slate-500">10% off</span></div></div>;
  if(section.type==="newsletter") return <div className="bg-slate-900 p-5 text-white"><h3 className="text-lg font-bold">{heading}</h3><p className="mt-1 text-xs text-slate-300">{String(s.description??"")}</p><div className="mt-3 h-9 rounded-lg bg-white/10"/></div>;
  return <div className="border-b bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-slate-500">{String(s.eyebrow??"")}</p><h3 className="mt-1 text-lg font-bold">{heading}</h3><p className="mt-1 text-xs text-slate-500">{String(s.description??s.subtitle??"")}</p></div>;
}


/** Homepage title, description and share image for Google and WhatsApp/Facebook link previews. Saved with the theme. */
function HomepageSeo({seo,onChange}:{seo:Record<string,unknown>;onChange:(key:string,value:string)=>void}){
  const text=(key:string)=>typeof seo[key]==="string"?String(seo[key]):"";
  return <div className="rounded-2xl border bg-white p-4 shadow-sm">
    <p className="text-sm font-semibold">Search engine (SEO)</p>
    <p className="mt-1 text-xs text-slate-500">How the homepage appears on Google and when shared. Save and publish to apply.</p>
    <div className="mt-3">
      <SeoFields title={text("title")} description={text("description")} onTitle={(v)=>onChange("title",v)} onDescription={(v)=>onChange("description",v)}
        autoTitle="AzadiMart — Online shopping from verified Indian sellers"
        autoDescription="Shop fashion, home & kitchen, beauty, electronics and more from KYC-verified Indian sellers. Quality-checked products, Cash on Delivery and easy returns across India."
        path="/" siteSuffix={false}/>
    </div>
    <div className="mt-3"><MediaField kind="image" label="Share image" hint="1200 × 630 px" size={{width:1200,height:630}} value={text("imageUrl")} onChange={(v)=>onChange("imageUrl",v)}/></div>
  </div>;
}
