"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Upload = { id: string; fileName: string; kind: "IMAGE" | "VIDEO" };
const steps = ["Basics", "Media", "Pricing", "Review"];

export default function ProductBuilder() {
  const router = useRouter();
  const [step,setStep] = useState(0);
  const [form,setForm] = useState({title:"",description:"",categoryId:"",sku:"",variantTitle:"Default",price:"",compareAt:"",onHand:"0"});
  const [images,setImages] = useState<Upload[]>([]);
  const [video,setVideo] = useState<Upload|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [categories,setCategories] = useState<Array<{id:string;name:string}>>([]);
  const [categoryLoading,setCategoryLoading] = useState(true);
  const set=(key:keyof typeof form,value:string)=>setForm(v=>({...v,[key]:value}));
  useEffect(()=>{
    void fetch("/api/v1/categories",{cache:"no-store"}).then(async response=>response.ok?response.json():Promise.reject(new Error("Unable to load categories."))).then(body=>setCategories(body.items??[])).catch(()=>setError("Unable to load categories. Please refresh and try again.")).finally(()=>setCategoryLoading(false));
  },[]);

  async function upload(file:File,kind:"IMAGE"|"VIDEO"){
    setBusy(true);setError("");setMessage("");
    try{
      const body=new FormData();body.append("file",file);body.append("kind",kind);
      const response=await fetch("/api/v1/media/products",{method:"POST",body});
      const json=await response.json();
      if(!response.ok)throw new Error(json?.error?.message??"Media upload failed.");
      const item={id:json.mediaAssetId,fileName:json.fileName,kind} as Upload;
      if(kind==="IMAGE")setImages(v=>[...v,item].slice(0,8));else setVideo(item);
      setMessage(file.name+" uploaded.");
    }catch(err){setError(err instanceof Error?err.message:"Media upload failed.");}
    finally{setBusy(false);}
  }

  function validate(){
    if(step===0&&(!form.title.trim()||!form.description.trim()||!form.categoryId.trim()))return "Complete title, description and category.";
    if(step===1&&images.length===0)return "Add at least one product image.";
    if(step===2&&(!form.sku.trim()||!form.price||Number(form.price)<0))return "Enter SKU and a valid selling price.";
    return "";
  }

  async function create(){
    const problem=validate();if(problem){setError(problem);return;}
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/v1/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        title:form.title.trim(),description:form.description.trim(),categoryId:form.categoryId.trim(),
        imageAssetIds:images.map(v=>v.id),videoAssetId:video?.id,
        variant:{sku:form.sku.trim(),title:form.variantTitle.trim()||"Default",pricePaise:Math.round(Number(form.price)*100),compareAtPaise:form.compareAt?Math.round(Number(form.compareAt)*100):undefined,onHand:Math.max(0,Math.floor(Number(form.onHand)||0))}
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
      {step===0?<div className="grid gap-5 sm:grid-cols-2">
        <Field label="Product title" value={form.title} onChange={v=>set("title",v)} wide/>
        <label className="text-sm font-semibold">Category<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" value={form.categoryId} onChange={e=>set("categoryId",e.target.value)} disabled={categoryLoading} required><option value="">{categoryLoading?"Loading categories…":"Select category"}</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <Field label="SKU" value={form.sku} onChange={v=>set("sku",v)}/>
        <label className="text-sm font-semibold sm:col-span-2">Description<textarea className="mt-2 min-h-36 w-full rounded-xl border border-slate-200 p-3" value={form.description} onChange={e=>set("description",e.target.value)} required/></label>
      </div>:null}
      {step===1?<div>
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-black">Product media</h2><p className="mt-1 text-sm text-slate-500">Up to 8 images and 1 video.</p></div><span className="text-xs text-slate-400">{images.length}/8 images</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map(item=><div key={item.id} className="rounded-2xl border p-3"><div className="grid aspect-square place-items-center rounded-xl bg-slate-50 text-xs font-black text-slate-300">IMAGE</div><p className="mt-2 truncate text-xs font-semibold">{item.fileName}</p></div>)}
          {images.length<8?<label className="grid aspect-square cursor-pointer place-items-center rounded-2xl border-2 border-dashed text-xs font-bold text-slate-500">Add image<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,"IMAGE");e.currentTarget.value=""}}/></label>:null}
        </div>
        <div className="mt-6 rounded-2xl border p-4"><p className="text-sm font-semibold">Product video <span className="font-normal text-slate-400">(optional)</span></p>{video?<p className="mt-2 text-sm">{video.fileName}</p>:<label className="mt-3 inline-flex cursor-pointer rounded-full border px-4 py-2 text-xs font-bold">Add video<input className="hidden" type="file" accept="video/mp4,video/webm" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,"VIDEO");e.currentTarget.value=""}}/></label>}</div>
      </div>:null}
      {step===2?<div className="grid gap-5 sm:grid-cols-2">
        <Field label="Variant title" value={form.variantTitle} onChange={v=>set("variantTitle",v)}/>
        <Field label="SKU" value={form.sku} onChange={v=>set("sku",v)}/>
        <Field label="Selling price (₹)" value={form.price} onChange={v=>set("price",v)} inputMode="decimal"/>
        <Field label="Compare-at price (₹)" value={form.compareAt} onChange={v=>set("compareAt",v)} inputMode="decimal"/>
        <Field label="Opening inventory" value={form.onHand} onChange={v=>set("onHand",v)} inputMode="numeric"/>
      </div>:null}
      {step===3?<div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Ready for QC</p><h2 className="mt-2 text-2xl font-black">Review before creating your draft.</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Summary label="Product" value={form.title||"—"}/><Summary label="Category" value={categories.find(category=>category.id===form.categoryId)?.name||"—"}/><Summary label="Images" value={String(images.length)}/><Summary label="Price" value={form.price?"₹"+form.price:"—"}/><Summary label="Opening stock" value={form.onHand}/></div><p className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Draft products remain hidden from customers until they pass QC and are published by AzadiMart.</p></div>:null}
      {error?<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}{message?<p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>:null}
      <div className="mt-7 flex justify-between border-t border-slate-100 pt-5"><button type="button" disabled={step===0||busy} onClick={()=>setStep(v=>Math.max(0,v-1))} className="rounded-full border px-5 py-3 text-sm font-bold disabled:opacity-40">Back</button>{step<3?<button type="button" disabled={busy} onClick={()=>{const p=validate();if(p)setError(p);else setStep(v=>v+1)}} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Continue</button>:<button type="button" disabled={busy} onClick={()=>void create()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy?"Creating…":"Create draft product"}</button>}</div>
    </div>
  </section>;
}
function Field({label,value,onChange,wide,inputMode}:{label:string;value:string;onChange:(value:string)=>void;wide?:boolean;inputMode?:"decimal"|"numeric"}){return <label className={"text-sm font-semibold "+(wide?"sm:col-span-2":"")}>{label}<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={value} onChange={e=>onChange(e.target.value)} inputMode={inputMode}/></label>}
function Summary({label,value}:{label:string;value:string}){return <div className="rounded-xl border p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>}