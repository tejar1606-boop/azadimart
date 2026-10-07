import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, navigation, navigationItems, themes } from "@azadimart/database";
import { AppError, navigationSchema, toApiError } from "@azadimart/shared";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const DEFAULT_ITEMS = [
  { label:"Home", href:"/", isActive:true },
  { label:"Shop", href:"/products", isActive:true },
  { label:"Coupons", href:"/products?offers=1", isActive:true },
  { label:"Become a seller", href:"/seller", isActive:true },
];

async function getPrimaryNavigation(){
  const db=createDatabase();
  let theme=(await db.select().from(themes).where(eq(themes.name,"AzadiMart Core")).limit(1))[0];
  if(!theme){
    const created=(await db.insert(themes).values({
      name:"AzadiMart Core",status:"DRAFT",settings:{mode:"premium-india",surface:"light"},
    }).returning())[0];
    if(!created) throw new AppError("INTERNAL","Theme creation failed",undefined,false);
    theme=created;
  }

  let nav=(await db.select().from(navigation).where(and(
    eq(navigation.themeId,theme.id),eq(navigation.handle,"main-menu"),
  )).limit(1))[0];

  if(!nav){
    const created=(await db.insert(navigation).values({
      themeId:theme.id,handle:"main-menu",items:[],
    }).returning())[0];
    if(!created) throw new AppError("INTERNAL","Navigation creation failed",undefined,false);
    nav=created;
  }

  let items=await db.select().from(navigationItems).where(eq(navigationItems.navigationId,nav.id)).orderBy(asc(navigationItems.position));

  if(items.length===0){
    const legacy=Array.isArray(nav.items)?nav.items.flatMap((item)=>(
      item && typeof item==="object" && typeof item.label==="string" && typeof item.href==="string"
        ? [{label:item.label,href:item.href,isActive:item.isActive!==false}]
        : []
    )):[];
    const seed=legacy.length?legacy:DEFAULT_ITEMS;
    items=await db.insert(navigationItems).values(seed.map((item,index)=>({
      navigationId:nav.id,label:item.label,href:item.href,position:index,isActive:item.isActive,
    }))).returning();
  }

  return {db,nav,items};
}

export async function GET(request:Request){
  const requestId=crypto.randomUUID();
  try{
    await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const {items}=await getPrimaryNavigation();
    return NextResponse.json({navigation:items.map(({label,href,isActive})=>({label,href:href??"/",isActive}))});
  }catch(error){const {status,body}=toApiError(error,requestId);return NextResponse.json(body,{status});}
}

export async function PUT(request:Request){
  const requestId=crypto.randomUUID();
  try{
    await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const input=navigationSchema.parse(await request.json());
    const {db,nav}=await getPrimaryNavigation();
    await db.transaction(async(tx)=>{
      await tx.delete(navigationItems).where(eq(navigationItems.navigationId,nav.id));
      if(input.items.length){
        await tx.insert(navigationItems).values(input.items.map((item,index)=>({
          navigationId:nav.id,label:item.label,href:item.href,position:index,isActive:item.isActive,
        })));
      }
      await tx.update(navigation).set({items:[],updatedAt:new Date()}).where(eq(navigation.id,nav.id));
    });
    const items=await db.select().from(navigationItems).where(eq(navigationItems.navigationId,nav.id)).orderBy(asc(navigationItems.position));
    return NextResponse.json({ok:true,navigation:items.map(({label,href,isActive})=>({label,href:href??"/",isActive}))});
  }catch(error){const {status,body}=toApiError(error,requestId);return NextResponse.json(body,{status});}
}
