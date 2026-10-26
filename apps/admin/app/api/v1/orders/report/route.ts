import { requireStaff } from "@azadimart/auth";
import { createDatabase, salesReport } from "@azadimart/database";
import { SALES_REPORT_PERIODS, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Sales report: orders per day and per state (?days=7|30|90), as JSON or a CSV download (?format=csv). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "orders");
    const url = new URL(request.url);
    const asked = Number(url.searchParams.get("days"));
    const days = (SALES_REPORT_PERIODS as readonly number[]).includes(asked) ? asked : 30;
    const report = await salesReport(createDatabase(), days);
    if (url.searchParams.get("format") !== "csv") return NextResponse.json(report, { headers: { "cache-control": "no-store" } });

    const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rs = (p: number) => (p / 100).toFixed(2);
    const lines = [
      ["Orders by day (India time)"], ["Day", "Orders placed", "Cancelled", "Returned", "Sales (₹)"],
      ...report.days.map((d) => [d.day, d.orders, d.cancelled, d.returned, rs(d.salesPaise)]),
      [],
      ["Orders by state"], ["State", "Orders placed", "Share %", "Cancelled", "Returned", "Sales (₹)", "Top cities"],
      ...report.states.map((s) => [s.state, s.orders, report.totals.orders ? ((s.orders / report.totals.orders) * 100).toFixed(1) : "0", s.cancelled, s.returned, rs(s.salesPaise), s.topCities.join(" | ")]),
      ...report.noOrders.map((s) => [s, 0, "0", 0, 0, "0.00", ""]),
    ];
    const body = "﻿" + lines.map((r) => r.map(cell).join(",")).join("\r\n");
    return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="loimart-sales-${days}-days-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
