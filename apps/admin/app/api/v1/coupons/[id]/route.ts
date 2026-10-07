import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, coupons } from "@azadimart/database";
import { AppError, couponUpdateSchema, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: { id:string } }) {
  const requestId=crypto.randomUUID();
  try{
    await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const input=couponUpdateSchema.parse(await request.json());
    const db=createDatabase();
    const existing=(await db.select({id:coupons.id,code:coupons.code}).from(coupons).where(eq(coupons.id,params.id)).limit(1))[0];
    if(!existing) throw new AppError("NOT_FOUND","Coupon not found");
    if(input.code && input.code!==existing.code){
      const duplicate=(await db.select({id:coupons.id}).from(coupons).where(eq(coupons.code,input.code)).limit(1))[0];
      if(duplicate) throw new AppError("CONFLICT","Coupon code already exists");
    }
    const patch:any={};
    for(const [key,value] of Object.entries(input)){
      if(value!==undefined && !["startsAt","endsAt"].includes(key)) patch[key]=value;
    }
    if(input.startsAt) patch.startsAt=new Date(input.startsAt);
    if(input.endsAt!==undefined) patch.endsAt=input.endsAt?new Date(input.endsAt):null;
    if(patch.discountType==="PERCENTAGE") patch.discountValue=Math.min(Number(patch.discountValue??0),100);
    patch.updatedAt=new Date();
    const row=(await db.update(coupons).set(patch).where(eq(coupons.id,params.id)).returning())[0];
    return NextResponse.json({coupon:row});
  }catch(error){const {status,body}=toApiError(error,requestId);return NextResponse.json(body,{status});}
}

export async function DELETE(request:Request,{params}:{params:{id:string}}){
  const requestId=crypto.randomUUID();
  try{
    await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const db=createDatabase();
    const existing=(await db.select({id:coupons.id}).from(coupons).where(eq(coupons.id,params.id)).limit(1))[0];
    if(!existing) throw new AppError("NOT_FOUND","Coupon not found");
    await db.update(coupons).set({isActive:false,updatedAt:new Date()}).where(eq(coupons.id,params.id));
    return NextResponse.json({ok:true});
  }catch(error){const {status,body}=toApiError(error,requestId);return NextResponse.json(body,{status});}
}