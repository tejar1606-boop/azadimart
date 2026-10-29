import { requireStaff } from "@azadimart/auth";
import { createDatabase, publishHomepage } from "@azadimart/database";
import { publishThemeSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "storefront");
    const input = publishThemeSchema.parse(await request.json());
    const result = await publishHomepage(createDatabase(), principal.userId, input.themeId, input.message);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
