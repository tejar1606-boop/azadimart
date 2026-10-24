import { requireStaff } from "@azadimart/auth";
import { createDatabase, loadHomepageForEditing, saveHomepageDraft } from "@azadimart/database";
import { saveHomepageSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "storefront");
    const { theme, page, themeSettings, sections, hasUnpublishedChanges } = await loadHomepageForEditing(createDatabase());
    return NextResponse.json({
      theme: { id: theme.id, name: theme.name, status: theme.status, settings: themeSettings },
      page: { id: page.id, title: page.title, status: page.status },
      sections,
      hasUnpublishedChanges,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "storefront");
    const input = saveHomepageSchema.parse(await request.json());
    await saveHomepageDraft(createDatabase(), principal.userId, { themeSettings: input.themeSettings, sections: input.sections });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use section editing in the Online Store editor." } },
    { status: 405 },
  );
}
