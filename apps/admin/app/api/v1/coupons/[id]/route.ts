import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, coupons } from "@azadimart/database";
import { AppError, couponUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id:string }> }) {
  const requestId=crypto.randomUUID();
  try{
    const principal=await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const { id } = await params;
    if(!uuidSchema.safeParse(id).success) throw new AppError("NOT_FOUND","Coupon not found");
    const input=couponUpdateSchema.parse(await request.json());
    const db=createDatabase();
    const existing=(await db.select().from(coupons).where(eq(coupons.id,id)).limit(1))[0];
    if(!existing) throw new AppError("NOT_FOUND","Coupon not found");
    // Validate the coupon as it will be after the update, not just the fields
    // sent: switching FIXED 5000 to PERCENTAGE alone must not create a 5000% coupon.
    const finalType = input.discountType ?? existing.discountType;
    const finalValue = input.discountValue ?? existing.discountValue;
    if(finalType==="PERCENTAGE" && (finalValue<1 || finalValue>100)) throw new AppError("VALIDATION_ERROR","Percentage discount must be between 1 and 100");
    const finalStartsAt = input.startsAt!==undefined ? new Date(input.startsAt) : existing.startsAt;
    const finalEndsAt = input.endsAt!==undefined ? (input.endsAt ? new Date(input.endsAt) : null) : existing.endsAt;
    if(finalEndsAt && finalEndsAt<=finalStartsAt) throw new AppError("VALIDATION_ERROR","End date must be after start date");
    const finalFundingType = input.fundingType ?? existing.fundingType;
    const finalSellerId = input.sellerId === undefined ? existing.sellerId : input.sellerId;
    if(finalFundingType === "SELLER" && !finalSellerId) throw new AppError("VALIDATION_ERROR","Seller is required for seller-funded coupons");
    if(input.code && input.code!==existing.code){
      const duplicate=(await db.select({id:coupons.id}).from(coupons).where(eq(coupons.code,input.code)).limit(1))[0];
      if(duplicate) throw new AppError("CONFLICT","Coupon code already exists");
    }

    const patch: Partial<typeof coupons.$inferInsert> = { updatedAt:new Date() };
    if(input.code!==undefined) patch.code=input.code;
    if(input.title!==undefined) patch.title=input.title;
    if(input.description!==undefined) patch.description=input.description ?? null;
    if(input.discountType!==undefined) patch.discountType=input.discountType;
    if(input.discountValue!==undefined) patch.discountValue=input.discountValue;
    if(input.minimumOrderPaise!==undefined) patch.minimumOrderPaise=input.minimumOrderPaise;
    if(input.maximumDiscountPaise!==undefined) patch.maximumDiscountPaise=input.maximumDiscountPaise;
    if(input.startsAt!==undefined) patch.startsAt=new Date(input.startsAt);
    if(input.endsAt!==undefined) patch.endsAt=input.endsAt?new Date(input.endsAt):null;
    if(input.usageLimit!==undefined) patch.usageLimit=input.usageLimit;
    if(input.perCustomerLimit!==undefined) patch.perCustomerLimit=input.perCustomerLimit;
    if(input.firstOrderOnly!==undefined) patch.firstOrderOnly=input.firstOrderOnly;
    if(input.stackable!==undefined) patch.stackable=input.stackable;
    if(input.fundingType!==undefined) patch.fundingType=input.fundingType;
    if(input.sellerId!==undefined) patch.sellerId=input.sellerId ?? null;
    if(input.scope!==undefined) patch.scope=input.scope;
    if(input.isActive!==undefined) patch.isActive=input.isActive;

    const row=await db.transaction(async(tx)=>{
      const updated=(await tx.update(coupons).set(patch).where(eq(coupons.id,id)).returning())[0];
      await tx.insert(auditLogs).values({actorUserId:principal.userId,action:"COUPON_UPDATED",entityType:"coupon",entityId:id,metadata:{code:updated?.code??existing.code,changes:input}});
      return updated;
    });
    return NextResponse.json({coupon:row});
  }catch(error){const {status,body}=toApiError(error,requestId);return NextResponse.json(body,{status});}
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  const requestId=crypto.randomUUID();
  try{
    const principal=await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const { id } = await params;
    if(!uuidSchema.safeParse(id).success) throw new AppError("NOT_FOUND","Coupon not found");
    const db=createDatabase();
    const existing=(await db.select({id:coupons.id,code:coupons.code}).from(coupons).where(eq(coupons.id,id)).limit(1))[0];
    if(!existing) throw new AppError("NOT_FOUND","Coupon not found");
    await db.transaction(async(tx)=>{
      await tx.update(coupons).set({isActive:false,updatedAt:new Date()}).where(eq(coupons.id,id));
      await tx.insert(auditLogs).values({actorUserId:principal.userId,action:"COUPON_DEACTIVATED",entityType:"coupon",entityId:id,metadata:{code:existing.code}});
    });
    return NextResponse.json({ok:true});
  }catch(error){const {status,body}=toApiError(error,requestId);return NextResponse.json(body,{status});}
}
