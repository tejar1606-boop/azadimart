import { requireStaff } from "@azadimart/auth";
import { adFestivalDays, auditLogs, createDatabase, setPlatformSetting } from "@azadimart/database";
import { AD_FESTIVAL_DAYS_KEY, adFestivalDaysSchema, istDayKey, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Festival and sale days: sellers can still bid or book them, but free ad days can't be used on them. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, ["banners", "marketing"]);
    const today = istDayKey();
    return NextResponse.json({ days: [...(await adFestivalDays(createDatabase()))].filter((d) => d >= today).sort() });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, ["banners", "marketing"]);
    const { days } = adFestivalDaysSchema.parse(await request.json());
    const db = createDatabase();
    // Past days drop off; the list is only what's coming.
    const today = istDayKey();
    const upcoming = days.filter((d) => d >= today).sort();
    await setPlatformSetting(db, AD_FESTIVAL_DAYS_KEY, { days: upcoming }, principal.userId);
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AD_FESTIVAL_DAYS_SET", entityType: "platform_setting", entityId: null, metadata: { days: upcoming } });
    return NextResponse.json({ ok: true, days: upcoming });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
