"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FREE_DELIVERY_FROM_PAISE, cashbackFor, customerPaysDelivery, walletUsable, type CashbackSettings } from "@azadimart/shared";
import { CashbackRow } from "../components/cashback-row";
import { PlatformFeeRow } from "../components/platform-fee-row";

type CartItem={variantId:string;title:string;variantTitle:string;sku:string;quantity:number;pricePaise:number;lineTotalPaise:number;isAvailable?:boolean};
type Address={id:string;label:string|null;line1:string;line2:string|null;city:string;state:string;postalCode:string;country:string;isDefault:boolean};
const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});

export default function CheckoutView(){
  const [cart,setCart]=useState<{cartId:string;items:CartItem[];subtotalPaise:number;platformFeePaise?:number;cashback?:CashbackSettings}|null>(null);
  const [addresses,setAddresses]=useState<Address[]>([]);
  const [selectedAddress,setSelectedAddress]=useState("");
  const [coupon,setCoupon]=useState("");
  const [discount,setDiscount]=useState(0);
  // Only a code that passed validation is sent with the order; a rejected or
  // edited code left in the box must not fail checkout.
  const [appliedCoupon,setAppliedCoupon]=useState<string>();
  const [couponMessage,setCouponMessage]=useState("");
  const [busy,setBusy]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [formError,setFormError]=useState("");
  const [addressType,setAddressType]=useState<""|"Home"|"Office"|"Others">("");
  const [newAddress,setNewAddress]=useState({label:"",line1:"",line2:"",city:"",state:"",postalCode:""});
  const [showAddressForm,setShowAddressForm]=useState(false);
  // Buy now (/checkout?buy=<variantId>): order only that item; the rest of the cart stays saved.
  const [buyOnly,setBuyOnly]=useState<string[]>();
  // LOIMART wallet (e.g. the ₹101 welcome bonus): ticked by default when there's money to use.
  const [wallet,setWallet]=useState<{balancePaise:number;rules:{enabled:boolean;maxPerOrderPaise:number;minOrderPaise:number}}|null>(null);
  const [useWallet,setUseWallet]=useState(true);
  useEffect(()=>{void fetch("/api/v1/wallet",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setWallet).catch(()=>setWallet(null));},[]);

  async function load(){
    setBusy(true);setError("");
    try{
      const [cartResponse,addressResponse]=await Promise.all([fetch("/api/v1/cart",{cache:"no-store"}),fetch("/api/v1/addresses",{cache:"no-store"})]);
      const cartBody=await cartResponse.json(),addressBody=await addressResponse.json();
      if(cartResponse.status===401) throw new Error("Please sign in before checkout.");
      if(!cartResponse.ok) throw new Error(cartBody?.error?.message??"Unable to load cart.");
      if(!addressResponse.ok) throw new Error(addressBody?.error?.message??"Unable to load addresses.");
      const buy=new URLSearchParams(window.location.search).get("buy")?.split(",").filter(Boolean);
      const chosen=buy?(cartBody.items as CartItem[]).filter(item=>buy.includes(item.variantId)):[];
      void applyBestOffer(cartBody.cartId,buy&&chosen.length?chosen.map(item=>item.variantId):undefined);
      if(buy&&chosen.length){
        setBuyOnly(chosen.map(item=>item.variantId));
        setCart({...cartBody,items:chosen,subtotalPaise:chosen.filter(item=>item.isAvailable!==false).reduce((sum,item)=>sum+item.lineTotalPaise,0)});
      }else setCart(cartBody);
      setAddresses(addressBody.items??[]);
      const defaultAddress=(addressBody.items??[]).find((v:Address)=>v.isDefault)||addressBody.items?.[0];
      if(defaultAddress)setSelectedAddress(defaultAddress.id);
    }catch(err){setError(err instanceof Error?err.message:"Unable to load checkout.");}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load()},[]);
  // Courier charge to the chosen address (charged only on orders under ₹301).
  const [deliveryFee,setDeliveryFee]=useState<number|null>(null);
  useEffect(()=>{
    if(!selectedAddress){setDeliveryFee(null);return;}
    const q=new URLSearchParams({addressId:selectedAddress});if(buyOnly?.length)q.set("variantIds",buyOnly.join(","));
    void fetch("/api/v1/checkout/delivery?"+q,{cache:"no-store"}).then(r=>r.ok?r.json():null).then(b=>setDeliveryFee(typeof b?.feePaise==="number"?b.feePaise:null)).catch(()=>setDeliveryFee(null));
  },[selectedAddress,buyOnly,cart?.items.length]);

  const afterCoupon=Math.max(0,(cart?.subtotalPaise??0)-discount);
  const walletCan=wallet?walletUsable(wallet.balancePaise,afterCoupon,wallet.rules):0;
  const walletUse=useWallet?walletCan:0;
  const platformFee=cart?.platformFeePaise??0;
  const paysDelivery=customerPaysDelivery(afterCoupon);
  const delivery=paysDelivery?deliveryFee??0:0;
  const total=Math.max(0,afterCoupon-walletUse)+delivery+platformFee;
  const cashback=cart?.cashback?cashbackFor(cart.cashback,afterCoupon):0;
  const unavailableItems=(cart?.items??[]).filter(item=>item.isAvailable===false);

  // The best LOIMART offer is applied automatically (no code needed); typing another code replaces it.
  async function applyBestOffer(cartId:string,variantIds?:string[]){
    try{
      const response=await fetch("/api/v1/coupons/best",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cartId,variantIds})});
      const body=await response.json();
      if(!response.ok||!body.code)return;
      setCoupon(body.code);setDiscount(body.discountPaise??0);setAppliedCoupon(body.code);setCouponMessage("Best offer applied automatically.");
    }catch{/* no offer: checkout works as before */}
  }

  async function applyCoupon(){
    if(!coupon.trim()||!cart)return;
    setWorking(true);setCouponMessage("");setError("");
    try{
      const response=await fetch("/api/v1/coupons/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cartId:cart.cartId,code:coupon,variantIds:buyOnly})});
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error?.message??"Coupon could not be applied.");
      setDiscount(body.discountPaise??0);
      setAppliedCoupon(coupon.trim());
      setCouponMessage(body.message??"Coupon applied.");
    }catch(err){setDiscount(0);setAppliedCoupon(undefined);setCouponMessage(err instanceof Error?err.message:"Coupon could not be applied.");}
    finally{setWorking(false);}
  }

  async function saveAddress(){
    if(!addressType){setFormError("Choose Home, Office or Others for this address.");return;}
    if(!newAddress.label.trim()){setFormError("Give this address a name, e.g. Mom's house.");return;}
    setWorking(true);setFormError("");
    try{
      const response=await fetch("/api/v1/addresses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newAddress,country:"IN",isDefault:addresses.length===0})});
      const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to save address.");
      setAddresses(v=>[body.item,...v]);setSelectedAddress(body.item.id);setShowAddressForm(false);
      setNewAddress({label:"",line1:"",line2:"",city:"",state:"",postalCode:""});setAddressType("");
    }catch(err){setFormError(err instanceof Error?err.message:"Unable to save address.");}
    finally{setWorking(false);}
  }

  async function placeOrder(){
    if(!selectedAddress||!cart)return;
    setWorking(true);setError("");
    try{
      const response=await fetch("/api/v1/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({shippingAddressId:selectedAddress,couponCode:appliedCoupon,paymentMethod:"COD",variantIds:buyOnly,useWallet:walletUse>0})});
      const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to place order.");
      window.location.href="/account/orders/"+encodeURIComponent(body.orderId);
    }catch(err){setError(err instanceof Error?err.message:"Unable to place order.");}
    finally{setWorking(false);}
  }

  const selected=useMemo(()=>addresses.find(v=>v.id===selectedAddress),[addresses,selectedAddress]);

  if(busy)return <main className="min-h-[60vh] bg-canvas px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-10 w-56 rounded bg-slate-200"/><div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="h-80 rounded-[2rem] bg-slate-200"/><div className="h-80 rounded-[2rem] bg-slate-200"/></div></div></main>;

  return <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Secure checkout</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Finish your order.</h1>{buyOnly?<p className="mt-2 text-sm text-slate-500">Buying this item now. The rest of your cart is saved for later.</p>:null}</div><Link href="/cart" className="text-sm font-semibold text-slate-500">← Cart</Link></div>
      {error?<div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} {error.includes("sign in")?<Link href={"/login?next="+encodeURIComponent("/checkout"+(typeof window!=="undefined"?window.location.search:""))} className="font-bold underline">Sign in</Link>:null}</div>:null}
      {(!cart||cart.items.length===0)?<div className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-bold">Your cart is empty.</p><Link href="/products" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Continue shopping</Link></div>:
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Delivery address</h2><p className="mt-1 text-xs text-slate-500">Use an address where the order can be delivered.</p></div><button type="button" onClick={()=>setShowAddressForm(v=>!v)} className="rounded-full border px-4 py-2 text-xs font-bold">{showAddressForm?"Close":"Add address"}</button></div>
            {showAddressForm?<div className="mt-5 grid gap-3 sm:grid-cols-2"><Input label="PIN code" placeholder="6-digit PIN code" numeric value={newAddress.postalCode} onChange={v=>setNewAddress(a=>({...a,postalCode:v}))}/><Input label="House no., building, street" placeholder="e.g. 12-4, Sai Residency, MG Road" value={newAddress.line1} onChange={v=>setNewAddress(a=>({...a,line1:v}))} wide/><Input label="Area, landmark (optional)" placeholder="e.g. Near Ram Temple" value={newAddress.line2} onChange={v=>setNewAddress(a=>({...a,line2:v}))} wide/><Input label="City / town" value={newAddress.city} onChange={v=>setNewAddress(a=>({...a,city:v}))}/><Input label="State" value={newAddress.state} onChange={v=>setNewAddress(a=>({...a,state:v}))}/><div className="border-t border-slate-100 pt-4 text-sm font-semibold sm:col-span-2">Save address as <span className="text-red-600">*</span><div className="mt-2 flex flex-wrap gap-2">{(["Home","Office","Others"] as const).map(type=><button key={type} type="button" onClick={()=>{setAddressType(type);setFormError("");setNewAddress(a=>({...a,label:type==="Others"?"":type}))}} className={"rounded-full border px-5 py-2 text-sm "+(addressType===type?"border-slate-950 bg-slate-950 text-white":"border-slate-300 text-slate-700 hover:border-slate-950")}>{type}</button>)}</div>{addressType==="Others"?<input autoFocus maxLength={30} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal placeholder:text-slate-400" placeholder="Name this address, e.g. Mom's house" value={newAddress.label} onChange={e=>setNewAddress(a=>({...a,label:e.target.value}))}/>:null}</div>{formError?<p className="text-sm font-semibold text-red-600 sm:col-span-2">{formError}</p>:null}<button type="button" disabled={working} onClick={()=>void saveAddress()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white sm:col-span-2">Save address</button></div>:
            <div className="mt-5 grid gap-3">{addresses.length===0?<p className="text-sm text-slate-500">Add your first delivery address.</p>:addresses.map(address=><label key={address.id} className={"flex cursor-pointer gap-3 rounded-2xl border p-4 "+(selectedAddress===address.id?"border-slate-950 ring-1 ring-slate-950":"border-slate-200")}><input type="radio" name="address" checked={selectedAddress===address.id} onChange={()=>setSelectedAddress(address.id)} className="mt-1"/><span className="min-w-0 text-sm"><span className="block font-bold">{address.label||"Address"} {address.isDefault?<em className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] not-italic">Default</em>:null}</span><span className="mt-1 block leading-5 text-slate-500">{address.line1}{address.line2?", "+address.line2:""}, {address.city}, {address.state} — {address.postalCode}</span></span></label>)}</div>}
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Items</h2><Link href="/cart" className="text-xs font-bold text-slate-500 hover:text-slate-950">Edit cart</Link></div><div className="mt-4 divide-y divide-slate-100">{cart.items.map(item=><div key={item.variantId} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-400">{item.variantTitle} · Qty {item.quantity}</p></div><p className="text-sm font-bold">{money(item.lineTotalPaise)}</p></div>)}</div></section>
        </div>
        <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">Order summary</h2>
          <div className="mt-5 flex gap-2"><input value={coupon} onChange={e=>{setCoupon(e.target.value.toUpperCase());setDiscount(0);setAppliedCoupon(undefined);setCouponMessage("")}} placeholder="Offer code" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm uppercase"/><button type="button" disabled={working||!coupon.trim()} onClick={()=>void applyCoupon()} className="rounded-xl border px-4 text-xs font-bold">Apply</button></div>
          {couponMessage?<p className="mt-2 text-xs text-slate-500">{couponMessage}</p>:null}
          {unavailableItems.length?<p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">Not available in the requested quantity: {unavailableItems.map(item=>item.title).join(", ")}. <Link href="/cart" className="underline">Update your cart</Link> to continue.</p>:null}
          {wallet&&wallet.balancePaise>0?(walletCan>0
            ?<label className="mt-4 flex cursor-pointer items-start gap-3 border border-[#E4D8FB] bg-[#F6F1FE] p-3 text-sm"><input type="checkbox" checked={useWallet} onChange={e=>setUseWallet(e.target.checked)} className="mt-0.5"/><span><b>Use {money(walletCan)} from your LOIMART wallet</b><span className="block text-xs text-slate-500">Balance {money(wallet.balancePaise)} · up to {money(wallet.rules.maxPerOrderPaise)} per order</span></span></label>
            :<p className="mt-4 bg-slate-50 p-3 text-xs text-slate-500">You have {money(wallet.balancePaise)} in your LOIMART wallet. Use it on orders of {money(wallet.rules.minOrderPaise)} or more.</p>):null}
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm"><Row label="Subtotal" value={money(cart.subtotalPaise)}/>{discount>0?<Row label="LOIMART offer" value={"−"+money(discount)}/>:null}{walletUse>0?<Row label="LOIMART wallet" value={"−"+money(walletUse)}/>:null}<Row label="Delivery" value={!paysDelivery?"Free":deliveryFee===null?"Choose an address":money(delivery)}/>{paysDelivery?<p className="-mt-1 text-xs font-semibold text-emerald-700">Add {money(FREE_DELIVERY_FROM_PAISE-afterCoupon)} more for FREE delivery.</p>:null}<PlatformFeeRow feePaise={platformFee}/><Row label="Total" value={money(total)} strong/><CashbackRow cashbackPaise={cashback}/></div>
          <div className="mt-5 rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white">₹</span><div><p className="text-sm font-bold">Cash on Delivery</p><p className="mt-1 text-xs text-slate-500">Available for this checkout.</p></div></div></div>
          {selected?<p className="mt-4 text-xs text-slate-500">Delivering to {selected.city}, {selected.state}.</p>:null}
          <button type="button" disabled={working||!selectedAddress||addresses.length===0||unavailableItems.length>0} onClick={()=>void placeOrder()} className="mt-5 w-full rounded-full bg-brand px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40">{working?"Processing…":"Place COD order"}</button><p className="mt-3 text-center text-[11px] leading-5 text-slate-400">By placing the order, you confirm the delivery address and order details shown above, and agree to our <Link href="/terms" className="underline underline-offset-2 hover:text-slate-600">Terms</Link> and <Link href="/privacy" className="underline underline-offset-2 hover:text-slate-600">Privacy Policy</Link>.</p>
        </aside>
      </div>}
    </div>
  </main>;
}

function Input({label,value,onChange,wide,placeholder,numeric}:{label:string;value:string;onChange:(value:string)=>void;wide?:boolean;placeholder?:string;numeric?:boolean}){return <label className={"text-sm font-semibold "+(wide?"sm:col-span-2":"")}>{label}<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal placeholder:text-slate-400" placeholder={placeholder} inputMode={numeric?"numeric":undefined} maxLength={numeric?6:undefined} value={value} onChange={e=>onChange(numeric?e.target.value.replace(/\D/g,""):e.target.value)} /></label>}
function Row({label,value,strong}:{label:string;value:string;strong?:boolean}){return <div className={"flex justify-between "+(strong?"pt-2 text-base font-bold":"text-slate-600")}><span>{label}</span><span className={strong?"text-slate-950":"text-slate-700"}>{value}</span></div>}
