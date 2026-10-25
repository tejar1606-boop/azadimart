import { requireApiAccess, enforceRateLimit } from "@azadimart/auth";
import {
  cartItems, carts, cashbackSettings, couponRedemptions, coupons, createDatabase, customerAddresses, orderLineGst, platformFeeSettings, productGstRules, spendWallet, walletBalance, walletSettings,
  customers, inventory, orderItems, orders, payments, productVariants, products, sellers, users,
} from "@azadimart/database";
import { AppError, SHIP_BY_DAYS, allocateCoupon, cashbackFor, splitCashback, checkoutSchema, checkSellerSupplyToState, platformFeeFor, toApiError, walletUsable } from "@azadimart/shared";
import { notifySellersOfNewOrder } from "@azadimart/notify";
import { getPaymentProvider } from "@azadimart/payments";
import { and, asc, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";


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
    await enforceRateLimit(db,request,"checkout",{subject:session.userId});
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

      // Row lock serializes concurrent submits for the same cart; the loser sees an empty cart instead of creating a duplicate order.
      const cart=(await tx.select({id:carts.id}).from(carts).where(eq(carts.customerId,session.customerId!)).limit(1).for("update"))[0];
      if(!cart)throw new AppError("UNPROCESSABLE","Your cart is empty");

      const rawLines=await tx.select({
        cartItemId:cartItems.id,variantId:productVariants.id,productId:products.id,categoryId:products.categoryId,sellerId:sellers.id,
        sellerName:sellers.storeName,taxIdentityType:sellers.taxIdentityType,businessState:sellers.businessState,gstin:sellers.gstin,gstEnrolmentId:sellers.gstEnrolmentId,
        title:products.title,sku:productVariants.sku,quantity:cartItems.quantity,unitPricePaise:productVariants.pricePaise,couponMaxDiscountPct:products.couponMaxDiscountPct,
        productStatus:products.status,variantActive:productVariants.isActive,onHand:inventory.onHand,reserved:inventory.reserved,
      }).from(cartItems).innerJoin(productVariants,eq(cartItems.variantId,productVariants.id)).innerJoin(products,eq(productVariants.productId,products.id))
        .innerJoin(sellers,eq(products.sellerId,sellers.id)).leftJoin(inventory,eq(inventory.variantId,productVariants.id))
        // Buy now: only the chosen lines are ordered; everything else stays in the cart.
        .where(input.variantIds?and(eq(cartItems.cartId,cart.id),inArray(cartItems.variantId,input.variantIds)):eq(cartItems.cartId,cart.id)).orderBy(asc(productVariants.id));

      if(rawLines.length===0)throw new AppError("UNPROCESSABLE",input.variantIds?"This item is no longer in your cart":"Your cart is empty");
      const unavailable=rawLines.filter(line=>line.productStatus!=="LIVE"||!line.variantActive);
      if(unavailable.length)throw new AppError("UNPROCESSABLE","No longer available — remove from your cart: "+unavailable.map(line=>line.title).join(", "));

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
      // The part of the coupon each line's seller pays (taken from their payout).
      let sellerShare=new Map<string,number>();
      // The whole coupon on each line, whoever pays it (cashback is on what the shopper pays).
      let couponPerLine=new Map<string,number>();

      if(input.couponCode){
        const coupon=(await tx.select().from(coupons).where(and(eq(coupons.code,input.couponCode),eq(coupons.isActive,true))).limit(1))[0];
        if(coupon){
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${coupon.id} || ':' || ${session.customerId!}, 0))`);
        }
        if(!coupon)throw new AppError("NOT_FOUND","Coupon code is not available");
        const now=new Date();
        if(coupon.startsAt>now||(coupon.endsAt&&coupon.endsAt<=now))throw new AppError("UNPROCESSABLE","Coupon is outside its valid date range");
        // Seller coupons only discount that seller's lines; coupons paid by sellers only products whose seller allows that much off.
        const allocation=allocateCoupon(coupon,rawLines.map(line=>({key:line.cartItemId,productId:line.productId,categoryId:line.categoryId,sellerId:line.sellerId,lineTotalPaise:line.unitPricePaise*line.quantity,couponMaxDiscountPct:line.couponMaxDiscountPct})));
        if(allocation.problem)throw new AppError("UNPROCESSABLE","Coupon is not applicable to this cart");
        if(coupon.usageLimit!==null&&coupon.usageCount>=coupon.usageLimit)throw new AppError("UNPROCESSABLE","Coupon usage limit has been reached");
        const customerRedemptions=(await tx.select({value:count()}).from(couponRedemptions).where(and(eq(couponRedemptions.couponId,coupon.id),eq(couponRedemptions.customerId,session.customerId!))))[0]?.value??0;
        if(customerRedemptions>=coupon.perCustomerLimit)throw new AppError("UNPROCESSABLE","You have already used this coupon the maximum number of times");
        if(coupon.firstOrderOnly){
          const previous=(await tx.select({id:orders.id}).from(orders).where(and(eq(orders.customerId,session.customerId!),ne(orders.status,"CANCELLED"))).limit(1))[0];
          if(previous)throw new AppError("UNPROCESSABLE","This coupon is only valid on your first order");
        }
        discount=allocation.discountPaise;
        if(allocation.sellerFunded)sellerShare=allocation.perLine;
        couponPerLine=allocation.perLine;
        couponCode=coupon.code;
      }

      const shipping=0;
      // LOIMART wallet money (e.g. the welcome bonus): up to the per-order limit, on orders worth the minimum.
      const wallet=input.useWallet?walletUsable(await walletBalance(tx,session.customerId!),subtotal-discount,await walletSettings(tx)):0;
      // Platform fee: once per order, kept by LOIMART (sellers' payouts don't change).
      const platformFee=platformFeeFor(await platformFeeSettings(tx));
      const grandTotal=Math.max(0,subtotal-discount-wallet)+shipping+platformFee;
      // Cashback: a % of the items after offers, into the wallet once the order is kept; each seller pays their lines' share.
      const linePaid=rawLines.map(line=>line.unitPricePaise*line.quantity-(couponPerLine.get(line.cartItemId)??0));
      const cashback=cashbackFor(await cashbackSettings(tx),subtotal-discount);
      const lineCashback=splitCashback(cashback,linePaid);
      const order=(await tx.insert(orders).values({
        orderNumber:orderNumber(),customerId:session.customerId!,shippingAddressId:address.id,status:"CONFIRMED",shipByAt:new Date(Date.now()+SHIP_BY_DAYS*24*60*60*1000),
        subtotalPaise:subtotal,discountPaise:discount,walletPaise:wallet,shippingPaise:shipping,platformFeePaise:platformFee,cashbackPaise:cashback,grandTotalPaise:grandTotal,couponCode:couponCode??null,
        shippingAddressSnapshot:{name:address.customerName,phone:address.customerPhone,line1:address.line1,line2:address.line2,city:address.city,state:address.state,postalCode:address.postalCode,country:address.country},
      }).returning()).at(0);
      if(!order)throw new AppError("INTERNAL","Order creation failed",undefined,false);

      for(const line of rawLines){
        const reserved=await tx.update(inventory).set({reserved:sql`${inventory.reserved} + ${line.quantity}`,updatedAt:new Date()})
          .where(and(eq(inventory.variantId,line.variantId),gte(sql`${inventory.onHand} - ${inventory.reserved}`,line.quantity))).returning({variantId:inventory.variantId});
        if(!reserved.length)throw new AppError("CONFLICT",`Stock changed for ${line.title}. Please try again.`);
      }

      // GST is saved on each line now, so the invoice uses the rate at the time of the order.
      const gstRules=await productGstRules(tx,rawLines.map(line=>line.productId));
      await tx.insert(orderItems).values(rawLines.map((line,index)=>{
        const sellerDiscountPaise=sellerShare.get(line.cartItemId)??0;
        return {
          orderId:order.id,sellerId:line.sellerId,productId:line.productId,variantId:line.variantId,title:line.title,sku:line.sku,quantity:line.quantity,unitPricePaise:line.unitPricePaise,sellerDiscountPaise,
          cashbackPaise:lineCashback[index]??0,
          ...orderLineGst(gstRules.get(line.productId),{unitPricePaise:line.unitPricePaise,quantity:line.quantity,sellerDiscountPaise}),
        };
      }));

      if(wallet>0)await spendWallet(tx,{customerId:session.customerId!,orderId:order.id,amountPaise:wallet});

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

      await tx.delete(cartItems).where(and(eq(cartItems.cartId,cart.id),inArray(cartItems.id,rawLines.map(line=>line.cartItemId))));
      return {orderId:order.id,orderNumber:order.orderNumber,subtotalPaise:subtotal,discountPaise:discount,walletPaise:wallet,shippingPaise:shipping,platformFeePaise:platformFee,cashbackPaise:cashback,grandTotalPaise:grandTotal,paymentStatus:"PENDING"};
    });
    // Alert each seller in the order (after commit; never blocks the customer's checkout).
    if(result.orderId)await notifySellersOfNewOrder(db,result.orderId);
    return NextResponse.json({ok:true,...result},{status:201});
  }catch(error){
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
