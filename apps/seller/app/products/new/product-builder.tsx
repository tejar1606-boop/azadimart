"use client";
import { useEffect, useState } from "react";
import { CouponLimitHelp, CouponLimitSelect } from "../coupon-limit";
import { useRouter } from "next/navigation";
import { DescriptionStyleToggle, SpecTableEditor, directUpload, readImageSize, type SpecRow } from "@azadimart/ui";
import { compareSizes } from "@azadimart/shared";
import VariantEditor, { autoSku, type VariantState } from "./variant-editor";

type LoadedVariant = { id?: string; sku: string; title?: string; pricePaise: number; compareAtPaise: number | null; onHand?: number | null; attributes?: Record<string, string> };
const rupeeText = (paise: number | null | undefined) => (paise != null ? String(paise / 100) : "");
const toPaise = (v: string) => Math.round(Number(v) * 100);

/** Colours, sizes and rows from saved variants (edit mode). */
function stateFromVariants(list: LoadedVariant[]): VariantState {
  const colors: VariantState["colors"] = [];
  const sizes: string[] = [];
  for (const v of list) {
    const a = v.attributes ?? {};
    if (a.color && !colors.some((c) => c.name === a.color)) colors.push({ name: a.color, hex: a.colorHex ?? "" });
    if (a.size && !sizes.includes(a.size)) sizes.push(a.size);
  }
  return { colors, sizes: sizes.sort(compareSizes), sizeLabel: list.find((v) => v.attributes?.sizeLabel)?.attributes?.sizeLabel, rows: list.map((v) => ({ id: v.id, color: v.attributes?.color, colorHex: v.attributes?.colorHex, size: v.attributes?.size, sku: v.sku, price: rupeeText(v.pricePaise), compareAt: rupeeText(v.compareAtPaise), onHand: String(v.onHand ?? 0), enabled: true })) };
}

type Upload = { id: string; fileName: string; kind: "IMAGE" | "VIDEO"; url: string };
const RECOMMENDED_PX = 1000;
const steps = ["Basics", "Media", "Price & sizes", "Review"];

type EditInfo = { status: string; pendingSince: string | null; rejectedNote: string | null; rejectedAt: string | null };
const LIVE_STATUSES = ["LIVE", "UNLISTED"];

/** Creates a product, or with productId edits an existing one (see PATCH /api/v1/products/[productId]). */
export default function ProductBuilder({ productId }: { productId?: string } = {}) {
  const router = useRouter();
  const [step,setStep] = useState(0);
  const [form,setForm] = useState({title:"",description:"",categoryId:"",sku:"",variantTitle:"Default",price:"",compareAt:"",weightGrams:"",onHand:"0"});
  const [couponPct,setCouponPct] = useState(0);
  // Colours / sizes (fashion etc.): each combination is a variant with its own SKU, price and stock.
  const [hasOptions,setHasOptions] = useState(false);
  const [options,setOptions] = useState<VariantState>({colors:[],sizes:[],rows:[]});
  const [imageColors,setImageColors] = useState<Record<string,string>>({});
  // Product details: a normal text description or a specification table; only the chosen style is saved.
  const [detailStyle,setDetailStyle] = useState<"text"|"table">("text");
  const [specs,setSpecs] = useState<SpecRow[]>([]);
  const [images,setImages] = useState<Upload[]>([]);
  const [video,setVideo] = useState<Upload|null>(null);
  const [busy,setBusy] = useState(false);
  const [progress,setProgress] = useState(0);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [categories,setCategories] = useState<Array<{id:string;name:string}>>([]);
  const [categoryLoading,setCategoryLoading] = useState(true);
  const [editInfo,setEditInfo] = useState<EditInfo|null>(null);
  const [loaded,setLoaded] = useState(!productId);
  const isLive = Boolean(editInfo && LIVE_STATUSES.includes(editInfo.status));
  const set=(key:keyof typeof form,value:string)=>setForm(v=>({...v,[key]:value}));
  useEffect(()=>{
    void fetch("/api/v1/categories",{cache:"no-store"}).then(async response=>response.ok?response.json():Promise.reject(new Error("Unable to load categories."))).then(body=>setCategories(body.items??[])).catch(()=>setError("Unable to load categories. Please refresh and try again.")).finally(()=>setCategoryLoading(false));
  },[]);

  // Edit mode: start from the edit waiting in QC if there is one, else the product as it is now.
  useEffect(()=>{
    if(!productId)return;
    type Media={id:string;kind:"IMAGE"|"VIDEO";url:string};
    void fetch(`/api/v1/products/${productId}`,{cache:"no-store"}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to load this product.");return body;}).then(body=>{
      const pending=body.pendingEdit;
      const source=pending?.changes??{...body.product,variant:body.variant};
      const media:Media[]=pending?pending.media:body.media;
      const v=source.variant??{};
      setForm({title:source.title??"",description:source.description??"",categoryId:source.categoryId??"",sku:v.sku??"",variantTitle:v.title??"Default",price:v.pricePaise!=null?String(v.pricePaise/100):"",compareAt:v.compareAtPaise!=null?String(v.compareAtPaise/100):"",weightGrams:v.weightGrams!=null?String(v.weightGrams):"",onHand:String(body.variant?.onHand??0)});
      setCouponPct(source.couponMaxDiscountPct??0);
      // Colours/sizes: from the edit waiting in QC if there is one, else the saved variants.
      const list:LoadedVariant[]=pending?(source.variants??[]).map((x:LoadedVariant)=>({...x,onHand:x.id?(body.variants??[]).find((b:LoadedVariant)=>b.id===x.id)?.onHand??0:x.onHand})):(body.variants??[]);
      if(list.some(x=>x.attributes?.color||x.attributes?.size)){setHasOptions(true);setOptions(stateFromVariants(list));}
      setImageColors(pending?(source.imageColors??{}):Object.fromEntries((body.media??[]).filter((m:{color?:string|null})=>m.color).map((m:{id:string;color:string})=>[m.id,m.color])));
      const rows:SpecRow[]=(source.specifications??[]).map((row:{label:string;value:string})=>({label:row.label,value:row.value}));
      setSpecs(rows);setDetailStyle(!source.description&&rows.length?"table":"text");
      const byId=new Map(media.map(m=>[m.id,m]));
      const imageIds:string[]=pending?pending.changes.imageAssetIds:media.filter(m=>m.kind==="IMAGE").map(m=>m.id);
      setImages(imageIds.map(id=>byId.get(id)).filter((m):m is Media=>Boolean(m)).map(m=>({id:m.id,fileName:"Current photo",kind:"IMAGE" as const,url:m.url})));
      const videoId:string|null=pending?pending.changes.videoAssetId:(media.find(m=>m.kind==="VIDEO")?.id??null);
      const vid=videoId?byId.get(videoId):undefined;setVideo(vid?{id:vid.id,fileName:"Current video",kind:"VIDEO",url:vid.url}:null);
      setEditInfo({status:body.product.status,pendingSince:pending?.submittedAt??null,rejectedNote:pending?null:(body.lastRejectedEdit?.notes??null),rejectedAt:pending?null:(body.lastRejectedEdit?.at??null)});
    }).catch(err=>setError(err instanceof Error?err.message:"Unable to load this product.")).finally(()=>setLoaded(true));
  },[productId]);

  async function upload(file:File,kind:"IMAGE"|"VIDEO"){
    setBusy(true);setError("");setMessage("");setProgress(0);
    try{
      let note="";
      if(kind==="IMAGE"){
        // Product photos are shown in square (1:1) frames; the server enforces this too.
        const size=await readImageSize(file);
        if(Math.abs(size.width-size.height)/Math.max(size.width,size.height)>0.02)throw new Error(`Product images must be square (1:1). This image is ${size.width} × ${size.height}; use ${RECOMMENDED_PX} × ${RECOMMENDED_PX} or larger.`);
        if(size.width<RECOMMENDED_PX)note=` Tip: ${RECOMMENDED_PX} × ${RECOMMENDED_PX} or larger looks sharper.`;
      }
      const result=await directUpload(file,{purpose:kind==="IMAGE"?"PRODUCT_IMAGE":"PRODUCT_VIDEO",onProgress:setProgress});
      const item:Upload={id:result.mediaAssetId,fileName:file.name,kind,url:result.url};
      if(kind==="IMAGE")setImages(v=>[...v,item].slice(0,8));else setVideo(item);
      setMessage(file.name+" uploaded."+note);
    }catch(err){setError(err instanceof Error?err.message:"Media upload failed.");}
    finally{setBusy(false);}
  }

  function validate(){
    if(step===0){
      if(!form.title.trim()||!form.categoryId.trim())return "Complete the title and category.";
      if(detailStyle==="text"&&!form.description.trim())return "Write a product description, or switch to a specification table.";
      if(detailStyle==="table"){
        const filled=specs.filter(r=>r.label.trim()||r.value.trim());
        if(!filled.length)return "Add at least one row to the specification table (or paste a table).";
        if(filled.some(r=>!r.label.trim()||!r.value.trim()))return "Every table row needs both a label and a value.";
      }
    }
    if(step===1&&images.length===0)return "Add at least one product image.";
    if(step===2&&hasOptions){
      const on=options.rows.filter(r=>r.enabled);
      if(!options.colors.length&&!options.sizes.length)return "Add at least one colour or size, or choose \"One option\".";
      if(!on.length)return "Tick at least one option to sell.";
      const bad=on.find(r=>r.sku.trim().length<3||!(Number(r.price)>0)||(r.compareAt!==""&&!(Number(r.compareAt)>=0))||!/^\d+$/.test(r.onHand.trim()||"0"));
      if(bad)return `Check ${[bad.color,bad.size].filter(Boolean).join(" / ")}: it needs a SKU (3+ characters), a selling price and whole-number stock.`;
      if(new Set(on.map(r=>r.sku.trim().toLowerCase())).size!==on.length)return "Each option needs its own SKU.";
      if(!(Number(form.weightGrams)>0))return "Enter the package weight in grams.";
      return "";
    }
    if(step===2&&(!form.sku.trim()||!form.price||Number(form.price)<0))return "Enter SKU and a valid selling price.";
    return "";
  }

  /** Colours/sizes payload: every ticked option, plus which photos show which colour. */
  function optionPayload(){
    if(!hasOptions)return {};
    const on=options.rows.filter(r=>r.enabled);
    const imageIds=new Set(images.map(v=>v.id));
    return {
      variants:on.map(r=>({id:r.id,sku:r.sku.trim(),pricePaise:toPaise(r.price),compareAtPaise:r.compareAt?toPaise(r.compareAt):null,onHand:Math.max(0,Math.floor(Number(r.onHand)||0)),color:r.color,colorHex:r.color?r.colorHex||undefined:undefined,size:r.size,sizeLabel:r.size?options.sizeLabel||undefined:undefined})),
      imageColors:Object.fromEntries(Object.entries(imageColors).filter(([id,c])=>imageIds.has(id)&&options.colors.some(x=>x.name===c))),
    };
  }
  /** The main variant: for colours/sizes, the first ticked option (it also carries the package weight). */
  function mainVariant(){
    const first=hasOptions?options.rows.find(r=>r.enabled):undefined;
    if(first)return {sku:first.sku.trim(),title:[first.color,first.size].filter(Boolean).join(" / ")||"Default",price:first.price,compareAt:first.compareAt};
    return {sku:form.sku.trim(),title:form.variantTitle.trim()||"Default",price:form.price,compareAt:form.compareAt};
  }

  async function create(){
    const problem=validate();if(problem){setError(problem);return;}
    setBusy(true);setError("");setMessage("");
    try{
      if(productId){
        const response=await fetch(`/api/v1/products/${productId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          title:form.title.trim(),categoryId:form.categoryId.trim(),
          description:detailStyle==="text"?form.description.trim():"",
          couponMaxDiscountPct:couponPct,
          specifications:detailStyle==="table"?specs.filter(r=>r.label.trim()&&r.value.trim()).map(r=>({label:r.label.trim(),value:r.value.trim()})):[],
          imageAssetIds:images.map(v=>v.id),videoAssetId:video?.id??null,
          variant:(m=>({sku:m.sku,title:m.title,pricePaise:toPaise(m.price),compareAtPaise:m.compareAt?toPaise(m.compareAt):null,weightGrams:Math.max(0,Math.floor(Number(form.weightGrams)||0))}))(mainVariant()),
          onHand:Math.max(0,Math.floor(Number(form.onHand)||0)),
          ...optionPayload(),
        })});
        const json=await response.json();if(!response.ok)throw new Error(json?.error?.message??"Couldn't save your changes.");
        setMessage(json.message??"Changes saved.");
        setTimeout(()=>router.push("/products"),1600);
        return;
      }
      const response=await fetch("/api/v1/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        title:form.title.trim(),categoryId:form.categoryId.trim(),
        description:detailStyle==="text"?form.description.trim():"",
        couponMaxDiscountPct:couponPct,
        specifications:detailStyle==="table"?specs.filter(r=>r.label.trim()&&r.value.trim()).map(r=>({label:r.label.trim(),value:r.value.trim()})):[],
        imageAssetIds:images.map(v=>v.id),videoAssetId:video?.id,
        variant:(m=>({sku:m.sku,title:m.title,pricePaise:toPaise(m.price),compareAtPaise:m.compareAt?toPaise(m.compareAt):undefined,weightGrams:Math.max(0,Math.floor(Number(form.weightGrams)||0)),onHand:Math.max(0,Math.floor(Number(form.onHand)||0))}))(mainVariant()),
        ...optionPayload()
      })});
      const json=await response.json();if(!response.ok)throw new Error(json?.error?.message??"Product creation failed.");
      setMessage("Product draft created.");
      setTimeout(()=>router.push("/products"),400);
    }catch(err){setError(err instanceof Error?err.message:"Product creation failed.");setBusy(false);}
  }

  const active = "rounded-full bg-slate-950 px-3.5 py-2 text-xs font-bold text-white";
  const done = "rounded-full bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700";
  const todo = "rounded-full px-3.5 py-2 text-xs font-bold text-slate-400";
  return <section className="mt-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-5 sm:p-7"><div className="flex gap-2 overflow-x-auto">
      {steps.map((label,index)=><button key={label} type="button" disabled={index>step} onClick={()=>setStep(index)} className={index===step?active:index<step?done:todo}>{index+1}. {label}</button>)}
    </div></div>
    <div className="p-5 sm:p-8">
      {!loaded?<p className="text-sm text-slate-500">Loading product…</p>:null}
      {editInfo?.pendingSince?<p className="mb-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><b>Changes waiting in QC</b> since {new Date(editInfo.pendingSince).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}. You&apos;re editing that version; saving again replaces it. Your live listing is unchanged until QC approves.</p>
        :isLive?<p className="mb-5 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900">This product is on the store. Changes go to QC first and your current listing stays live meanwhile. <b>Stock</b> updates instantly.</p>:null}
      {editInfo?.rejectedNote?<p className="mb-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800"><b>QC didn&apos;t approve your last changes:</b> {editInfo.rejectedNote}</p>:null}
      {loaded&&step===0?<div className="grid gap-5 sm:grid-cols-2">
        <Field label="Product title" value={form.title} onChange={v=>set("title",v)} wide/>
        <label className="text-sm font-semibold">Category<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" value={form.categoryId} onChange={e=>set("categoryId",e.target.value)} disabled={categoryLoading} required><option value="">{categoryLoading?"Loading categories…":"Select category"}</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <Field label="SKU" value={form.sku} onChange={v=>set("sku",v)}/>
        <div className="sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Product details</p><DescriptionStyleToggle value={detailStyle} onChange={setDetailStyle}/></div>
          <p className="mt-1 text-xs text-slate-500">{detailStyle==="text"?"Describe the product in your own words.":"Best for specifications like size, material and warranty. Paste a table or add rows."} Only the selected style is saved.</p>
          <div className="mt-3">{detailStyle==="text"
            ?<textarea className="min-h-36 w-full rounded-xl border border-slate-200 p-3" aria-label="Description" value={form.description} onChange={e=>set("description",e.target.value)}/>
            :<SpecTableEditor rows={specs} onChange={setSpecs}/>}</div>
        </div>
      </div>:null}
      {step===1?<div>
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-black">Product media</h2><p className="mt-1 text-sm text-slate-500">Up to 8 square (1:1) images — {RECOMMENDED_PX} × {RECOMMENDED_PX} px or larger, JPG, PNG or high-quality WebP — and 1 video (MP4, WebM or MOV, any quality).</p></div><span className="text-xs text-slate-400">{images.length}/8 images</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((item,index)=><div key={item.id} className="rounded-2xl border p-3"><div className="relative aspect-square overflow-hidden rounded-xl bg-slate-50"><div className="h-full w-full bg-cover bg-center" style={{backgroundImage:`url("${item.url}")`}}/>{index===0?<span className="absolute left-2 top-2 rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white">Cover</span>:null}</div><div className="mt-2 flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{item.fileName}</p><button type="button" onClick={()=>setImages(v=>v.filter(x=>x.id!==item.id))} className="shrink-0 text-xs font-semibold text-red-600">Remove</button></div></div>)}
          {images.length<8?<label className="grid aspect-square cursor-pointer place-items-center rounded-2xl border-2 border-dashed text-xs font-bold text-slate-500">Add image<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,"IMAGE");e.currentTarget.value=""}}/></label>:null}
        </div>
        <div className="mt-6 rounded-2xl border p-4"><p className="text-sm font-semibold">Product video <span className="font-normal text-slate-400">(optional)</span></p>{video?<div className="mt-3 flex flex-wrap items-center gap-3"><video src={video.url} className="h-28 w-28 rounded-xl bg-black object-cover" muted playsInline controls/><div><p className="text-sm font-semibold">{video.fileName}</p><button type="button" onClick={()=>setVideo(null)} className="mt-1 text-xs font-semibold text-red-600">Remove</button></div></div>:<label className="mt-3 inline-flex cursor-pointer rounded-full border px-4 py-2 text-xs font-bold">Add video<input className="hidden" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,"VIDEO");e.currentTarget.value=""}}/></label>}</div>
      </div>:null}
      {step===2?<div>
        <p className="text-sm font-semibold">Does this product come in different colours or sizes?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([[false,"One option","A single version, e.g. a mixer grinder or a book."],[true,"Colours and/or sizes","e.g. a kurta in Red and Blue, sizes S to XXL."]] as const).map(([v,label,hint])=><button key={label} type="button" aria-pressed={hasOptions===v} onClick={()=>{setHasOptions(v);if(v&&!options.rows.length)setOptions(o=>({...o}));}} className={"rounded-2xl border p-4 text-left transition "+(hasOptions===v?"border-slate-950 bg-slate-50":"border-slate-200 hover:border-slate-900")}><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-slate-500">{hint}</span></button>)}
        </div>
        {hasOptions?<div className="mt-6 grid gap-5">
          <VariantEditor value={options} onChange={setOptions} baseSku={form.sku||autoSku(form.title.split(" ").slice(0,2).join(""))} defaultPrice={form.price} defaultCompareAt={form.compareAt} images={images.map(i=>({id:i.id,url:i.url}))} imageColors={imageColors} onImageColors={setImageColors}/>
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Package weight (grams)" value={form.weightGrams} onChange={v=>set("weightGrams",v)} inputMode="numeric"/></div>
          <div className="text-sm font-semibold"><label htmlFor="coupon-limit">LOIMART coupons</label><CouponLimitSelect id="coupon-limit" value={couponPct} onChange={setCouponPct}/><CouponLimitHelp pct={couponPct} pricePaise={options.rows.find(r=>r.enabled&&r.price)?toPaise(options.rows.find(r=>r.enabled&&r.price)!.price):null}/></div>
        </div>:<div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Variant title" value={form.variantTitle} onChange={v=>set("variantTitle",v)}/>
        <Field label="SKU" value={form.sku} onChange={v=>set("sku",v)}/>
        <Field label="Selling price (₹)" value={form.price} onChange={v=>set("price",v)} inputMode="decimal"/>
        <Field label="Compare-at price (₹)" value={form.compareAt} onChange={v=>set("compareAt",v)} inputMode="decimal"/>
        <Field label="Package weight (grams)" value={form.weightGrams} onChange={v=>set("weightGrams",v)} inputMode="numeric"/>
        <Field label={productId?"Stock in hand":"Opening inventory"} value={form.onHand} onChange={v=>set("onHand",v)} inputMode="numeric"/>
        <div className="text-sm font-semibold sm:col-span-2"><label htmlFor="coupon-limit">LOIMART coupons</label><CouponLimitSelect id="coupon-limit" value={couponPct} onChange={setCouponPct}/><CouponLimitHelp pct={couponPct} pricePaise={form.price?Math.round(Number(form.price)*100):null}/></div>
      </div>}
      </div>:null}
      {step===3?<div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Ready for QC</p><h2 className="mt-2 text-2xl font-black">{productId?"Review your changes.":"Review before creating your draft."}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Summary label="Product" value={form.title||"—"}/><Summary label="Category" value={categories.find(category=>category.id===form.categoryId)?.name||"—"}/><Summary label="Product details" value={detailStyle==="table"?`Specification table · ${specs.filter(r=>r.label.trim()&&r.value.trim()).length} rows`:"Text description"}/><Summary label="Images" value={String(images.length)}/>{hasOptions?<Summary label="Options" value={`${options.colors.length?options.colors.map(c=>c.name).join(", "):"—"}${options.sizes.length?" · "+options.sizes.join(", "):""} (${options.rows.filter(r=>r.enabled).length} on sale)`}/>:<Summary label="Price" value={form.price?"₹"+form.price:"—"}/>}<Summary label="Package weight" value={form.weightGrams+" g"}/><Summary label={productId?"Stock in hand":"Opening stock"} value={hasOptions?String(options.rows.filter(r=>r.enabled).reduce((n,r)=>n+(Number(r.onHand)||0),0))+" (all options)":form.onHand}/></div><p className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">{isLive?"Your changes go to LOIMART QC. Your current listing stays on the store until they're approved; stock updates straight away.":productId?"Saving updates this product. If it's in QC review, it goes back to QC with your changes.":"Draft products remain hidden from customers until they pass QC and are published by LOIMART."}</p></div>:null}
      {busy&&step===1?<div className="mt-5"><p className="text-xs font-semibold text-slate-500">Uploading… {progress}%</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-950 transition-[width]" style={{width:progress+"%"}}/></div></div>:null}
      {error?<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}{message?<p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>:null}
      <div className="mt-7 flex justify-between border-t border-slate-100 pt-5"><button type="button" disabled={step===0||busy} onClick={()=>setStep(v=>Math.max(0,v-1))} className="rounded-full border px-5 py-3 text-sm font-bold disabled:opacity-40">Back</button>{step<3?<button type="button" disabled={busy} onClick={()=>{const p=validate();if(p)setError(p);else setStep(v=>v+1)}} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Continue</button>:<button type="button" disabled={busy} onClick={()=>void create()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy?(productId?"Saving…":"Creating…"):productId?(isLive?"Send changes to QC":"Save changes"):"Create draft product"}</button>}</div>
    </div>
  </section>;
}
function Field({label,value,onChange,wide,inputMode}:{label:string;value:string;onChange:(value:string)=>void;wide?:boolean;inputMode?:"decimal"|"numeric"}){return <label className={"text-sm font-semibold "+(wide?"sm:col-span-2":"")}>{label}<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={value} onChange={e=>onChange(e.target.value)} inputMode={inputMode}/></label>}
function Summary({label,value}:{label:string;value:string}){return <div className="rounded-xl border p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>}