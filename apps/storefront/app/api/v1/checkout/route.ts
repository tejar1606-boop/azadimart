import { requireApiAccess } from "@azadimart/auth";
import {
  cartItems, carts, couponRedemptions, coupons, createDatabase, customerAddresses,
  customers, inventory, orderItems, orders, payments, productVariants, products, sellers, users,
} from "@azadimart/database";
import { AppError, checkoutSchema, checkSellerSupplyToState, toApiError } from "@azadimart/shared";
import { getPaymentProvider } from "@azadimart/payments";
import { and, asc, count, eq, gte, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

function matchesScope(scope: {productIds?:string[];categoryIds?:string[];sellerIds?:string[]}, line: {productId:string;categoryId:string;sellerId:string}) {
  const productsMatch = scope.productIds?.length ? scope.productIds.includes(line.productId) : false;
  const categoriesMatch = scope.categoryIds?.length ? scope.categoryIds.includes(line.categoryId) : false;
  const sellersMatch = scope.sellerIds?.length ? scope.sellerIds.includes(line.sellerId) : false;
  if (!scope.productIds?.length && !scope.categoryIds?.length && !scope.sellerIds?.length) return true;
  return productsMatch || categoriesMatch || sellersMatch;
}

function discountForCoupon(coupon:{discountType:"PERCENTAGE"|"FIXED"|"FREE_SHIPPING";discountValue:number;maximumDiscountPaise:number|null},subtotal:number){
  if(coupon.discountType==="FREE_SHIPPING"||subtotal<=0)return 0;
  const raw=coupon.discountType==="PERCENTAGE"?Math.floor(subtotal*coupon.discountValue/100):coupon.discountValue;
  return Math.min(subtotal, coupon.maximumDiscountPaise===null?raw:Math.min(raw,coupon.maximumDiscountPaise));
}

function orderNumber(){return "AZM-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();}

async function getCheckoutState(request:Request){
  const session=await requireApiAccess(request,"storefront",["CUSTOMER"]);
  if(!session.customerId)throw new AppError("UNAUTHORIZED","Customer profile required");
  const db=createDatabase();
  return {session,db};
}

export async function POST(request:Request){
  const requestId=crypto.randomUUID();
  try{
    const input=checkoutSchema.parse(await request.json());
    const {session,db}=await getCheckoutState(request);
    if(input.paymentMethod!=="COD") {
      getPaymentProvider(input.paymentMethod);
      throw new AppError("UNPROCESSABLE", input.paymentMethod+" payments are not configured yet. Choose Cash on Delivery.");
    }

    const result=await db.transaction(async tx=>{
      const address=(await tx.select({
        id:customerAddresses.id,
        label:customerAddresses.label,
        line1:customerAddresses.line1,
        line2:customerAddresses.line2,
        city:customerAddresses.city,
        state:customerAddresses.state,
        postalCode:customerAddresses.postalCode,
        country:customerAddresses.country,
        customerName:customers.fullName,
        customerPhone:users.phone,
      }).from(customerAddresses)
        .innerJoin(customers,eq(customers.id,customerAddresses.customerId))
        .innerJoin(users,eq(users.id,customers.userId))
        .where(and(eq(customerAddresses.id,input.shippingAddressId),eq(customerAddresses.customerId,session.customerId!))).limit(1))[0];
      if(!address)throw new AppError("NOT_FOUND","Shipping address not found");

      const cart=(await tx.select({id:carts.id}).from(carts).where(eq(carts.customerId,session.customerId!)).limit(1))[0];
      if(!cart)throw new AppError("UNPROCESSABLE","Your cart is empty");

      const rawLines=await tx.select({
        cartItemId:cartItems.id,variantId:productVariants.id,productId:products.id,categoryId:products.categoryId,sellerId:sellers.id,
        sellerName:sellers.storeName,taxIdentityType:sellers.taxIdentityType,businessState:sellers.businessState,gstin:sellers.gstin,gstEnrolmentId:sellers.gstEnrolmentId,
        title:products.title,sku:productVariants.sku,quantity:cartItems.quantity,unitPricePaise:productVariants.pricePaise,
        productStatus:products.status,variantActive:productVariants.isActive,onHand:inventory.onHand,reserved:inventory.reserved,
      }).from(cartItems).innerJoin(productVariants,eq(cartItems.variantId,productVariants.id)).innerJoin(products,eq(productVariants.productId,products.id))
        .innerJoin(sellers,eq(products.sellerId,sellers.id)).leftJoin(inventory,eq(inventory.variantId,productVariants.id))
        .where(eq(cartItems.cartId,cart.id)).orderBy(asc(productVariants.id));

      if(rawLines.length===0)throw new AppError("UNPROCESSABLE","Your cart is empty");
      if(rawLines.some(line=>line.productStatus!=="LIVE"||!line.variantActive))throw new AppError("UNPROCESSABLE","One or more cart items are no longer available");

      for(const line of rawLines){
        const supply=checkSellerSupplyToState({
          taxIdentityType:line.taxIdentityType as "GSTIN"|"ENROLMENT_ID",
          businessState:line.businessState??"",
          gstin:line.gstin,gstEnrolmentId:line.gstEnrolmentId,
        },address.state);
        if(!supply.allowed)throw new AppError("UNPROCESSABLE",supply.reason??"Seller cannot supply to this address");
        const available=Math.max(0,(line.onHand??0)-(line.reserved??0));
        if(line.quantity>available)throw new AppError("UNPROCESSABLE",`Only ${available} units are available for ${line.title}`);
      }

      const subtotal=rawLines.reduce((sum,line)=>sum+line.unitPricePaise*line.quantity,0);
      let discount=0;let couponCode:string|undefined;

      if(input.couponCode){
        const coupon=(await tx.select().from(coupons).where(and(eq(coupons.code,input.couponCode),eq(coupons.isActive,true))).limit(1))[0];
        if(coupon){
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${coupon.id} || ':' || ${session.customerId!}, 0))`);
        }
        if(!coupon)throw new AppError("NOT_FOUND","Coupon code is not available");
        const now=new Date();
        if(coupon.startsAt>now||(coupon.endsAt&&coupon.endsAt<=now))throw new AppError("UNPROCESSABLE","Coupon is outside its valid date range");
        const scope=(coupon.scope??{}) as {productIds?:string[];categoryIds?:string[];sellerIds?:string[]};
        const eligible=rawLines.filter(line=>matchesScope(scope,line));
        const eligibleSubtotal=eligible.reduce((sum,line)=>sum+line.unitPricePaise*line.quantity,0);
        if(!eligible.length||eligibleSubtotal<coupon.minimumOrderPaise)throw new AppError("UNPROCESSABLE","Coupon is not applicable to this cart");
        if(coupon.sellerId&&!eligible.some(line=>line.sellerId===coupon.sellerId))throw new AppError("UNPROCESSABLE","Coupon is not applicable to this cart");
        if(coupon.usageLimit!==null&&coupon.usageCount>=coupon.usageLimit)throw new AppError("UNPROCESSABLE","Coupon usage limit has been reached");
        const customerRedemptions=(await tx.select({value:count()}).from(couponRedemptions).where(and(eq(couponRedemptions.couponId,coupon.id),eq(couponRedemptions.customerId,session.customerId!))))[0]?.value??0;
        if(customerRedemptions>=coupon.perCustomerLimit)throw new AppError("UNPROCESSABLE","You have already used this coupon the maximum number of times");
        if(coupon.firstOrderOnly){
          const previous=(await tx.select({id:orders.id}).from(orders).where(and(eq(orders.customerId,session.customerId!),ne(orders.status,"CANCELLED"))).limit(1))[0];
          if(previous)throw new AppError("UNPROCESSABLE","This coupon is only valid on your first order");
        }
        discount=coupon.discountType==="FREE_SHIPPING"?0:discountForCoupon(coupon,eligibleSubtotal);
        couponCode=coupon.code;
      }

      const shipping=0;
      const grandTotal=Math.max(0,subtotal-discount+shipping);
      const order=(await tx.insert(orders).values({
        orderNumber:orderNumber(),customerId:session.customerId!,shippingAddressId:address.id,status:"CONFIRMED",
        subtotalPaise:subtotal,discountPaise:discount,shippingPaise:shipping,grandTotalPaise:grandTotal,couponCode:couponCode??null,
        shippingAddressSnapshot:{name:address.customerName,phone:address.customerPhone,line1:address.line1,line2:address.line2,city:address.city,state:address.state,postalCode:address.postalCode,country:address.country},
      }).returning()).at(0);
      if(!order)throw new AppError("INTERNAL","Order creation failed",undefined,false);

      for(const line of rawLines){
        const reserved=await tx.update(inventory).set({reserved:sql`${inventory.reserved} + ${line.quantity}`,updatedAt:new Date()})
          .where(and(eq(inventory.variantId,line.variantId),gte(sql`${inventory.onHand} - ${inventory.reserved}`,line.quantity))).returning({variantId:inventory.variantId});
        if(!reserved.length)throw new AppError("CONFLICT",`Stock changed for ${line.title}. Please try again.`);
      }

      await tx.insert(orderItems).values(rawLines.map(line=>({
        orderId:order.id,sellerId:line.sellerId,productId:line.productId,variantId:line.variantId,title:line.title,sku:line.sku,quantity:line.quantity,unitPricePaise:line.unitPricePaise,
      })));

      const payment=getPaymentProvider("COD");
      const intent=await payment.createPayment({orderId:order.id,amountPaise:grandTotal,currency:"INR",customer:{id:session.customerId!},returnUrl:"/account/orders"});
      await tx.insert(payments).values({orderId:order.id,provider:"COD",providerPaymentId:intent.providerPaymentId,status:"PENDING",amountPaise:grandTotal,currency:"INR"});

      if(couponCode){
        const coupon=(await tx.select({id:coupons.id,usageCount:coupons.usageCount,usageLimit:coupons.usageLimit}).from(coupons).where(eq(coupons.code,couponCode)).limit(1))[0];
        if(!coupon)throw new AppError("CONFLICT","Coupon became unavailable");
        if(coupon.usageLimit!==null&&coupon.usageCount>=coupon.usageLimit)throw new AppError("CONFLICT","Coupon usage limit was reached. Please retry.");
        const updatedCoupon = coupon.usageLimit === null
          ? await tx.update(coupons).set({usageCount:sql`${coupons.usageCount} + 1`,updatedAt:new Date()}).where(eq(coupons.id,coupon.id)).returning({ id:coupons.id })
          : await tx.update(coupons).set({usageCount:sql`${coupons.usageCount} + 1`,updatedAt:new Date()}).where(and(eq(coupons.id,coupon.id),sql`${coupons.usageCount} < ${coupon.usageLimit}`)).returning({ id:coupons.id });
        if (!updatedCoupon.length) throw new AppError("CONFLICT","Coupon usage limit was reached. Please retry.");
        await tx.insert(couponRedemptions).values({couponId:coupon.id,customerId:session.customerId!,orderId:order.id,discountPaise:discount});
      }

      await tx.delete(cartItems).where(eq(cartItems.cartId,cart.id));
      return {orderId:order.id,orderNumber:order.orderNumber,subtotalPaise:subtotal,discountPaise:discount,shippingPaise:shipping,grandTotalPaise:grandTotal,paymentStatus:"PENDING"};
    });
    return NextResponse.json({ok:true,...result},{status:201});
  }catch(error){
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
