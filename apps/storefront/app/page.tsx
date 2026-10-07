import CouponCard from "./components/coupon-card";
import Link from "next/link";
import { createDatabase, coupons, navigation, pageSections, pages, productVariants, products, themes } from "@azadimart/database";
import { and, asc, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const money = (p:number) => "₹" + (p/100).toLocaleString("en-IN", { maximumFractionDigits:0 });

async function getHome(){
  const db=createDatabase();
  const theme=(await db.select().from(themes).where(eq(themes.status,"PUBLISHED")).limit(1))[0];
  if(!theme) return {sections:[],coupons:[],products:[],navigationItems:[]};
  const page=(await db.select().from(pages).where(and(eq(pages.themeId,theme.id),eq(pages.slug,"home"),eq(pages.status,"PUBLISHED"))).limit(1))[0];
  const nav=(await db.select().from(navigation).where(and(eq(navigation.themeId,theme.id),eq(navigation.handle,"main-menu"))).limit(1))[0];
  const navigationItems=Array.isArray(nav?.items)?nav.items.filter((item)=>item && typeof item==="object" && typeof (item as {label?:unknown}).label==="string" && typeof (item as {href?:unknown}).href==="string" && (item as {isActive?:unknown}).isActive!==false):[];
  if(!page) return {sections:[],coupons:[],products:[],navigationItems};
  const sections=await db.select().from(pageSections).where(eq(pageSections.pageId,page.id)).orderBy(asc(pageSections.position));
  const now=new Date();
  const allCoupons=await db.select({id:coupons.id,code:coupons.code,title:coupons.title,description:coupons.description,discountType:coupons.discountType,discountValue:coupons.discountValue,minimumOrderPaise:coupons.minimumOrderPaise,startsAt:coupons.startsAt,endsAt:coupons.endsAt}).from(coupons).where(eq(coupons.isActive,true)).orderBy(desc(coupons.createdAt)).limit(24);
  const activeCoupons=allCoupons.filter(c=>c.startsAt<=now && (!c.endsAt || c.endsAt>now)).slice(0,12);
  const liveProducts=await db.select({id:products.id,title:products.title,slug:products.slug,pricePaise:productVariants.pricePaise}).from(products).innerJoin(productVariants,eq(productVariants.productId,products.id)).where(eq(products.status,"LIVE")).orderBy(desc(products.createdAt)).limit(12);
  return {sections,coupons:activeCoupons,products:liveProducts,navigationItems};
}

export default async function HomePage(){
  const data=await getHome();
  return <main className="min-h-screen bg-[#fbfaf7] text-slate-950">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="shrink-0 text-lg font-black tracking-tight">Azadi<span className="text-amber-500">Mart</span></Link>
        <nav className="hidden gap-5 text-sm font-medium md:flex">{data.navigationItems.map((item)=>{const navItem=item as {label:string;href:string};return <Link key={navItem.href+navItem.label} href={navItem.href}>{navItem.label}</Link>})}</nav>
        <div className="ml-auto flex items-center gap-2"><span className="hidden rounded-full border px-3 py-2 text-xs sm:block">Search products</span><Link href="/products" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white">Shop now</Link></div>
      </div>
      <div className="border-t border-slate-100 px-4 py-2 md:hidden">
        <div className="flex gap-2 overflow-x-auto">
          {data.navigationItems.map((item)=>{const navItem=item as {label:string;href:string};return <Link key={"m-"+navItem.href+navItem.label} href={navItem.href} className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{navItem.label}</Link>})}
        </div>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 sm:px-6">{data.sections.length===0?<DefaultHero/>:data.sections.filter((s)=>s.isVisible).map((s)=><StoreSection key={s.id} section={s} coupons={data.coupons} products={data.products}/>)}</div>
  </main>;
}

function DefaultHero(){return <section className="my-6 rounded-3xl bg-slate-950 px-6 py-12 text-white sm:px-10 lg:my-8 lg:px-14 lg:py-20"><p className="text-xs uppercase tracking-[0.24em] text-amber-300">Made for India</p><h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Everything India. One trusted marketplace.</h1><p className="mt-5 max-w-2xl text-base text-slate-300">Discover products from verified sellers across farming, travel, fashion, home and beauty.</p><Link href="/products" className="mt-7 inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">Shop now</Link></section>}

type HomeSection = { id:string; type:string; position:number; isVisible:boolean; settings:Record<string,unknown> };
type HomeCoupon = { id:string; code:string; title:string; description?:string|null; discountType:"PERCENTAGE"|"FIXED"|"FREE_SHIPPING"; discountValue:number; minimumOrderPaise:number; startsAt:Date; endsAt:Date|null };
type HomeProduct = { id:string; title:string; slug:string; pricePaise:number };
function StoreSection({section,coupons,products}:{section:HomeSection;coupons:HomeCoupon[];products:HomeProduct[]}){
 const s=section.settings;
 const categories = Array.isArray(s.categories) ? s.categories.filter((value): value is string => typeof value === "string") : [];
 if(section.type==="hero") return <section className="my-6 rounded-3xl bg-slate-950 px-6 py-12 text-white sm:px-10 lg:my-8 lg:px-14 lg:py-20"><p className="text-xs uppercase tracking-[0.24em] text-amber-300">{String(s.eyebrow||"Made for India")}</p><h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">{String(s.heading||"Everything India.")}</h1><p className="mt-5 max-w-2xl text-base text-slate-300">{String(s.description||"")}</p><div className="mt-7 flex flex-wrap gap-3"><Link href={String(s.primaryHref||"/products")} className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">{String(s.primaryLabel||"Shop now")}</Link>{s.secondaryLabel&&<Link href={String(s.secondaryHref||"/seller")} className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold">{String(s.secondaryLabel)}</Link>}</div></section>;
 if(section.type==="category_grid") return <section className="py-8 sm:py-12"><h2 className="text-2xl font-black sm:text-3xl">{String(s.heading||"Shop by category")}</h2><p className="mt-1 text-sm text-slate-500">{String(s.subtitle||"")}</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{categories.map((c)=><Link href="/products" key={String(c)} className="rounded-2xl border border-slate-200 bg-white p-5 font-semibold shadow-sm transition hover:-translate-y-0.5">{String(c)}<span className="mt-7 block text-xs text-slate-500">Explore →</span></Link>)}</div></section>;
 if(section.type==="featured_products") return <section className="py-8 sm:py-12"><h2 className="text-2xl font-black sm:text-3xl">{String(s.heading||"Featured products")}</h2><p className="mt-1 text-sm text-slate-500">{String(s.subtitle||"")}</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{products.slice(0,Number(s.limit||8)).map((p)=><Link href={"/products/"+p.slug} key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="grid aspect-square place-items-center rounded-xl bg-slate-100 text-3xl font-black text-slate-300">{String(p.title).slice(0,1)}</div><p className="mt-3 line-clamp-2 text-sm font-semibold">{p.title}</p><p className="mt-1 text-base font-black">{money(p.pricePaise)}</p></Link>)}</div></section>;
 if(section.type==="sales_coupons") return <section className="my-8 rounded-3xl bg-amber-50 p-5 sm:p-7"><h2 className="text-2xl font-black">{String(s.heading||"Save more with coupons")}</h2><p className="mt-1 text-sm text-slate-600">{String(s.subtitle||"")}</p><div className="mt-5 grid gap-3 md:grid-cols-2">{coupons.slice(0,Number(s.limit||4)).map((c)=><CouponCard key={c.id} coupon={c}/>)}</div></section>;
 if(section.type==="image_banner") return <section className="my-8 rounded-3xl bg-slate-900 p-7 text-white sm:p-10"><p className="text-xs uppercase tracking-[0.2em] text-amber-300">{String(s.eyebrow||"Proudly Indian")}</p><h2 className="mt-2 max-w-2xl text-3xl font-black sm:text-4xl">{String(s.heading||"Support Indian sellers.")}</h2><p className="mt-3 max-w-2xl text-slate-300">{String(s.description||"")}</p><Link href={String(s.buttonHref||"/products")} className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">{String(s.buttonLabel||"Explore")}</Link></section>;
 if(section.type==="newsletter") return <section className="my-8 rounded-3xl border border-slate-200 bg-white p-7 sm:p-10"><h2 className="text-2xl font-black">{String(s.heading||"Stay in the loop")}</h2><p className="mt-2 max-w-xl text-sm text-slate-500">{String(s.description||"")}</p><div className="mt-5 flex max-w-xl flex-col gap-2 sm:flex-row"><input className="min-h-11 flex-1 rounded-full border px-4" placeholder="Your email address"/><button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">{String(s.buttonLabel||"Notify me")}</button></div></section>;
 return <section className="py-8"><h2 className="text-2xl font-black">{String(s.heading||section.type)}</h2><p className="mt-2 text-slate-500">{String(s.description||s.subtitle||"")}</p></section>;
}

