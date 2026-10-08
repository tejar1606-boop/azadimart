"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CartItem={variantId:string;title:string;variantTitle:string;sku:string;quantity:number;pricePaise:number;lineTotalPaise:number;isAvailable?:boolean};
type Address={id:string;label:string|null;line1:string;line2:string|null;city:string;state:string;postalCode:string;country:string;isDefault:boolean};
const money=(p:number)=>"₹"+(p/100).toLocaleString("en-IN",{maximumFractionDigits:0});

export default function CheckoutView(){
  const [cart,setCart]=useState<{cartId:string;items:CartItem[];subtotalPaise:number}|null>(null);
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
  const [newAddress,setNewAddress]=useState({label:"Home",line1:"",line2:"",city:"",state:"",postalCode:""});
  const [showAddressForm,setShowAddressForm]=useState(false);

  async function load(){
    setBusy(true);setError("");
    try{
      const [cartResponse,addressResponse]=await Promise.all([fetch("/api/v1/cart",{cache:"no-store"}),fetch("/api/v1/addresses",{cache:"no-store"})]);
      const cartBody=await cartResponse.json(),addressBody=await addressResponse.json();
      if(cartResponse.status===401) throw new Error("Please sign in before checkout.");
      if(!cartResponse.ok) throw new Error(cartBody?.error?.message??"Unable to load cart.");
      if(!addressResponse.ok) throw new Error(addressBody?.error?.message??"Unable to load addresses.");
      setCart(cartBody);setAddresses(addressBody.items??[]);
      const defaultAddress=(addressBody.items??[]).find((v:Address)=>v.isDefault)||addressBody.items?.[0];
      if(defaultAddress)setSelectedAddress(defaultAddress.id);
    }catch(err){setError(err instanceof Error?err.message:"Unable to load checkout.");}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load()},[]);

  const total=Math.max(0,(cart?.subtotalPaise??0)-discount);
  const unavailableItems=(cart?.items??[]).filter(item=>item.isAvailable===false);

  async function applyCoupon(){
    if(!coupon.trim()||!cart)return;
    setWorking(true);setCouponMessage("");setError("");
    try{
      const response=await fetch("/api/v1/coupons/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cartId:cart.cartId,code:coupon})});
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error?.message??"Coupon could not be applied.");
      setDiscount(body.discountPaise??0);
      setAppliedCoupon(coupon.trim());
      setCouponMessage(body.message??"Coupon applied.");
    }catch(err){setDiscount(0);setAppliedCoupon(undefined);setCouponMessage(err instanceof Error?err.message:"Coupon could not be applied.");}
    finally{setWorking(false);}
  }

  async function saveAddress(){
    setWorking(true);setError("");
    try{
      const response=await fetch("/api/v1/addresses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newAddress,country:"IN",isDefault:addresses.length===0})});
      const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to save address.");
      setAddresses(v=>[body.item,...v]);setSelectedAddress(body.item.id);setShowAddressForm(false);
      setNewAddress({label:"Home",line1:"",line2:"",city:"",state:"",postalCode:""});
    }catch(err){setError(err instanceof Error?err.message:"Unable to save address.");}
    finally{setWorking(false);}
  }

  async function placeOrder(){
    if(!selectedAddress||!cart)return;
    setWorking(true);setError("");
    try{
      const response=await fetch("/api/v1/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({shippingAddressId:selectedAddress,couponCode:appliedCoupon,paymentMethod:"COD"})});
      const body=await response.json();if(!response.ok)throw new Error(body?.error?.message??"Unable to place order.");
      window.location.href="/account/orders/"+encodeURIComponent(body.orderId);
    }catch(err){setError(err instanceof Error?err.message:"Unable to place order.");}
    finally{setWorking(false);}
  }

  const selected=useMemo(()=>addresses.find(v=>v.id===selectedAddress),[addresses,selectedAddress]);

  if(busy)return <main className="min-h-screen bg-[#f8f7f3] px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-10 w-56 rounded bg-slate-200"/><div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="h-80 rounded-[2rem] bg-slate-200"/><div className="h-80 rounded-[2rem] bg-slate-200"/></div></div></main>;

  return <main className="min-h-screen bg-[#f8f7f3] px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Secure checkout</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Finish your order.</h1></div><Link href="/cart" className="text-sm font-semibold text-slate-500">← Cart</Link></div>
      {error?<div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} {error.includes("sign in")?<Link href="/login" className="font-bold underline">Sign in</Link>:null}</div>:null}
      {(!cart||cart.items.length===0)?<div className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-black">Your cart is empty.</p><Link href="/products" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Continue shopping</Link></div>:
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Delivery address</h2><p className="mt-1 text-xs text-slate-500">Use an address where the order can be delivered.</p></div><button type="button" onClick={()=>setShowAddressForm(v=>!v)} className="rounded-full border px-4 py-2 text-xs font-bold">{showAddressForm?"Close":"Add address"}</button></div>
            {showAddressForm?<div className="mt-5 grid gap-3 sm:grid-cols-2"><Input label="Label" value={newAddress.label} onChange={v=>setNewAddress(a=>({...a,label:v}))}/><Input label="PIN code" value={newAddress.postalCode} onChange={v=>setNewAddress(a=>({...a,postalCode:v}))}/><Input label="Address line 1" value={newAddress.line1} onChange={v=>setNewAddress(a=>({...a,line1:v}))} wide/><Input label="Address line 2" value={newAddress.line2} onChange={v=>setNewAddress(a=>({...a,line2:v}))} wide/><Input label="City" value={newAddress.city} onChange={v=>setNewAddress(a=>({...a,city:v}))}/><Input label="State" value={newAddress.state} onChange={v=>setNewAddress(a=>({...a,state:v}))}/><button type="button" disabled={working} onClick={()=>void saveAddress()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white sm:col-span-2">Save address</button></div>:
            <div className="mt-5 grid gap-3">{addresses.length===0?<p className="text-sm text-slate-500">Add your first delivery address.</p>:addresses.map(address=><label key={address.id} className={"flex cursor-pointer gap-3 rounded-2xl border p-4 "+(selectedAddress===address.id?"border-slate-950 ring-1 ring-slate-950":"border-slate-200")}><input type="radio" name="address" checked={selectedAddress===address.id} onChange={()=>setSelectedAddress(address.id)} className="mt-1"/><span className="min-w-0 text-sm"><span className="block font-bold">{address.label||"Address"} {address.isDefault?<em className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] not-italic">Default</em>:null}</span><span className="mt-1 block leading-5 text-slate-500">{address.line1}{address.line2?", "+address.line2:""}, {address.city}, {address.state} — {address.postalCode}</span></span></label>)}</div>}
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Items</h2><Link href="/cart" className="text-xs font-bold text-slate-500 hover:text-slate-950">Edit cart</Link></div><div className="mt-4 divide-y divide-slate-100">{cart.items.map(item=><div key={item.variantId} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-400">{item.variantTitle} · Qty {item.quantity}</p></div><p className="text-sm font-black">{money(item.lineTotalPaise)}</p></div>)}</div></section>
        </div>
        <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:sticky lg:top-24">
          <h2 className="text-lg font-black">Order summary</h2>
          <div className="mt-5 flex gap-2"><input value={coupon} onChange={e=>{setCoupon(e.target.value.toUpperCase());setDiscount(0);setAppliedCoupon(undefined);setCouponMessage("")}} placeholder="Coupon code" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm uppercase"/><button type="button" disabled={working||!coupon.trim()} onClick={()=>void applyCoupon()} className="rounded-xl border px-4 text-xs font-black">Apply</button></div>
          {couponMessage?<p className="mt-2 text-xs text-slate-500">{couponMessage}</p>:null}
          {unavailableItems.length?<p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">Not available in the requested quantity: {unavailableItems.map(item=>item.title).join(", ")}. <Link href="/cart" className="underline">Update your cart</Link> to continue.</p>:null}
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm"><Row label="Subtotal" value={money(cart.subtotalPaise)}/><Row label="Discount" value={"−"+money(discount)}/><Row label="Shipping" value="Free"/><Row label="Total" value={money(total)} strong/></div>
          <div className="mt-5 rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">₹</span><div><p className="text-sm font-bold">Cash on Delivery</p><p className="mt-1 text-xs text-slate-500">Available for this checkout.</p></div></div></div>
          {selected?<p className="mt-4 text-xs text-slate-500">Delivering to {selected.city}, {selected.state}.</p>:null}
          <button type="button" disabled={working||!selectedAddress||addresses.length===0||unavailableItems.length>0} onClick={()=>void placeOrder()} className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3.5 text-sm font-black text-white disabled:opacity-40">{working?"Processing…":"Place COD order"}</button><p className="mt-3 text-center text-[11px] leading-5 text-slate-400">By placing the order, you confirm the delivery address and order details shown above.</p>
        </aside>
      </div>}
    </div>
  </main>;
}

function Input({label,value,onChange,wide}:{label:string;value:string;onChange:(value:string)=>void;wide?:boolean}){return <label className={"text-sm font-semibold "+(wide?"sm:col-span-2":"")}>{label}<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={value} onChange={e=>onChange(e.target.value)} /></label>}
function Row({label,value,strong}:{label:string;value:string;strong?:boolean}){return <div className={"flex justify-between "+(strong?"pt-2 text-base font-black":"text-slate-600")}><span>{label}</span><span className={strong?"text-slate-950":"text-slate-700"}>{value}</span></div>}
