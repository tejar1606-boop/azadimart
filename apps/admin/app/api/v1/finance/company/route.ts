import { requireStaff } from "@azadimart/auth";
import { COMPANY_DETAILS_KEY, createDatabase, getCompanyDetails, setPlatformSetting } from "@azadimart/database";
import { companyDetailsSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** LOIMART's registered company details, printed on invoices as the e-commerce operator. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    return NextResponse.json({ details: await getCompanyDetails(createDatabase()) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const details = companyDetailsSchema.parse(await request.json());
    await setPlatformSetting(createDatabase(), COMPANY_DETAILS_KEY, details, principal.userId);
    return NextResponse.json({ ok: true, details });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
