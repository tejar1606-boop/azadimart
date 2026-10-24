import { requireStaff } from "@azadimart/auth";
import { createDatabase, loadHomepageForEditing, updateHomepageSections } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Home page sections the Banner Studio edits. Everything else (layout, product rows) stays in Admin → Online Store. */
const BANNER_TYPES = ["hero", "promo_banner", "banner_row"] as const;

/** The home page's banner sections (draft if there is one), with their place on the page. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "banners");
    const { theme, sections, hasUnpublishedChanges } = await loadHomepageForEditing(createDatabase());
    return NextResponse.json({
      themeId: theme.id,
      hasUnpublishedChanges,
      sections: sections.map((s, position) => ({ position, type: s.type, isVisible: s.isVisible, settings: (BANNER_TYPES as readonly string[]).includes(s.type) ? s.settings : undefined })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

const saveSchema = z.object({
  sections: z.array(z.object({
    position: z.number().int().min(0).max(200),
    type: z.enum(BANNER_TYPES),
    isVisible: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()),
  })).min(1).max(50),
});

/** Saves banner edits into the home page draft without touching other sections. */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "banners");
    const input = saveSchema.parse(await request.json());
    await updateHomepageSections(createDatabase(), principal.userId, input.sections);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
