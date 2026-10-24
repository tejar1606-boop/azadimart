import { requireStaff } from "@azadimart/auth";
import { createDatabase, createInboundCall } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { telephony } from "../../../../lib/telephony";

/** Test servers only: pretend a customer called the LOIMART number (to try routing, the pop-up and missed calls). */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "support");
    const line = telephony();
    if (line?.name !== "test") throw new AppError("FORBIDDEN", "Simulated calls only work on the test server");
    const input = z.object({ phone: z.string().regex(/^\+?\d[\d\s-]{9,15}$/, "Enter a phone number"), ivrChoice: z.enum(["ORDERS", "SELLERS", "OTHER"]).default("ORDERS") }).parse(await request.json());
    const call = await createInboundCall(createDatabase(), { phone: input.phone, provider: "test", providerCallId: "test_in_" + crypto.randomUUID(), ivrChoice: input.ivrChoice, businessNumber: line.businessNumber });
    return NextResponse.json({ ok: true, callId: call?.id }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
