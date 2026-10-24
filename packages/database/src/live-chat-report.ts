import { supportCategoryLabel } from "@azadimart/shared";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "./client";

/** Filters for the live chat report. Dates are whole days in India time (YYYY-MM-DD, "to" included). */
export type LiveChatReportFilter = {
  from: string;
  to: string;
  agentId?: string;
  source?: "STOREFRONT" | "SELLER";
  rating?: number | "none";
  outcome?: "RESOLVED" | "ABANDONED" | "IDLE" | "TICKET" | "MISSED";
};

export type LiveChatReportRow = {
  id: string; source: string; requesterType: string; name: string; contact: string | null; topic: string;
  agent: string | null; createdAt: string; acceptedAt: string | null; firstReplyAt: string | null; endedAt: string | null;
  waitSeconds: number | null; firstReplySeconds: number | null; durationSeconds: number | null;
  messages: number; files: number; status: string; endReason: string | null; endedBy: string | null;
  rating: number | null; ratingNote: string | null; ticketNumber: number | null;
};

const day = (v: string, end: boolean) => `${v}T${end ? "23:59:59.999" : "00:00:00"}+05:30`;

function where(f: LiveChatReportFilter): SQL {
  const parts: SQL[] = [sql`c.created_at >= ${day(f.from, false)}::timestamptz`, sql`c.created_at <= ${day(f.to, true)}::timestamptz`];
  if (f.agentId) parts.push(sql`c.assigned_agent_id = ${f.agentId}::uuid`);
  if (f.source) parts.push(sql`c.source = ${f.source}`);
  if (f.rating === "none") parts.push(sql`c.rating is null and c.status = 'ENDED'`);
  else if (typeof f.rating === "number") parts.push(sql`c.rating = ${f.rating}`);
  if (f.outcome === "MISSED") parts.push(sql`c.status = 'ENDED' and c.accepted_at is null and c.end_reason <> 'TICKET'`);
  else if (f.outcome) parts.push(sql`c.end_reason = ${f.outcome}`);
  return sql.join(parts, sql` and `);
}

const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v)));
const avg1 = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

/**
 * Numbers for Admin → Live chat → Reports: totals, response times, ratings
 * (with the 1–5 star split), each agent's performance and a day-by-day trend.
 */
export async function liveChatReport(db: Database, f: LiveChatReportFilter) {
  const w = where(f);
  const [summary, stars, agents, daily] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select count(*)::int total,
        count(*) filter (where c.accepted_at is not null)::int answered,
        count(*) filter (where c.status = 'ENDED' and c.accepted_at is null and c.end_reason <> 'TICKET')::int missed,
        count(*) filter (where c.end_reason = 'TICKET')::int tickets,
        count(*) filter (where c.status <> 'ENDED')::int open,
        avg(extract(epoch from (c.accepted_at - c.created_at))) filter (where c.accepted_at is not null) avg_wait,
        avg(extract(epoch from (c.first_agent_reply_at - c.accepted_at))) filter (where c.first_agent_reply_at is not null) avg_first,
        avg(extract(epoch from (c.ended_at - c.accepted_at))) filter (where c.ended_at is not null and c.accepted_at is not null) avg_duration,
        avg(c.rating) avg_rating, count(c.rating)::int rated,
        count(*) filter (where c.status = 'ENDED' and c.accepted_at is not null)::int answered_ended
      from live_chats c where ${w}`),
    db.execute<{ rating: number; n: number }>(sql`select c.rating, count(*)::int n from live_chats c where ${w} and c.rating is not null group by c.rating`),
    db.execute<Record<string, unknown>>(sql`
      select c.assigned_agent_id id, coalesce(sm.display_name, split_part(u.email, '@', 1)) as name, count(*)::int chats,
        count(*) filter (where c.end_reason = 'RESOLVED')::int resolved,
        count(*) filter (where c.end_reason = 'TICKET')::int tickets,
        avg(extract(epoch from (c.first_agent_reply_at - c.accepted_at))) filter (where c.first_agent_reply_at is not null) avg_first,
        avg(extract(epoch from (c.ended_at - c.accepted_at))) filter (where c.ended_at is not null and c.accepted_at is not null) avg_duration,
        avg(c.rating) avg_rating, count(c.rating)::int rated,
        count(*) filter (where c.rating <= 2)::int low
      from live_chats c join users u on u.id = c.assigned_agent_id left join staff_members sm on sm.user_id = c.assigned_agent_id
      where ${w} group by c.assigned_agent_id, sm.display_name, u.email order by chats desc`),
    db.execute<Record<string, unknown>>(sql`
      select to_char(c.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') d, count(*)::int chats,
        count(*) filter (where c.status = 'ENDED' and c.accepted_at is null and c.end_reason <> 'TICKET')::int missed,
        avg(c.rating) avg_rating, count(c.rating)::int rated
      from live_chats c where ${w} group by d order by d`),
  ]);
  const s = summary.rows[0] ?? {};
  const total = Number(s.total ?? 0);
  return {
    summary: {
      total, answered: Number(s.answered ?? 0), missed: Number(s.missed ?? 0), tickets: Number(s.tickets ?? 0), open: Number(s.open ?? 0),
      answerRate: total ? Math.round((Number(s.answered ?? 0) / total) * 100) : null,
      avgWaitSeconds: num(s.avg_wait), avgFirstReplySeconds: num(s.avg_first), avgDurationSeconds: num(s.avg_duration),
      avgRating: avg1(s.avg_rating), rated: Number(s.rated ?? 0),
      // Share of finished, answered chats that the shopper/seller rated.
      ratingRate: Number(s.answered_ended ?? 0) ? Math.round((Number(s.rated ?? 0) / Number(s.answered_ended)) * 100) : null,
      stars: [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: Number(stars.rows.find((x) => Number(x.rating) === r)?.n ?? 0) })),
    },
    agents: agents.rows.map((a) => ({
      id: String(a.id), name: String(a.name ?? "Agent"), chats: Number(a.chats), resolved: Number(a.resolved), tickets: Number(a.tickets),
      avgFirstReplySeconds: num(a.avg_first), avgDurationSeconds: num(a.avg_duration), avgRating: avg1(a.avg_rating), rated: Number(a.rated), lowRatings: Number(a.low),
    })),
    daily: daily.rows.map((d) => ({ day: String(d.d), chats: Number(d.chats), missed: Number(d.missed), avgRating: avg1(d.avg_rating), rated: Number(d.rated) })),
  };
}

/** One row per chat (newest first) for the report table and the CSV download. */
export async function liveChatReportRows(db: Database, f: LiveChatReportFilter, limit: number): Promise<LiveChatReportRow[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select c.id, c.source, c.requester_type, coalesce(cu.full_name, s.store_name, c.guest_name, 'Guest') as name,
      coalesce(ru.email, ru.phone, c.guest_contact) as contact, c.topic,
      coalesce(sm.display_name, split_part(au.email, '@', 1)) as agent,
      c.created_at, c.accepted_at, c.first_agent_reply_at, c.ended_at, c.status, c.end_reason, c.ended_by, c.rating, c.rating_note, t.number as ticket_number,
      (select count(*) from live_chat_messages m where m.chat_id = c.id and m.author <> 'SYSTEM')::int as messages,
      (select count(*) from live_chat_messages m where m.chat_id = c.id and m.attachment is not null)::int as files
    from live_chats c
      left join customers cu on cu.id = c.customer_id
      left join sellers s on s.id = c.seller_id
      left join users ru on ru.id = c.user_id
      left join users au on au.id = c.assigned_agent_id
      left join staff_members sm on sm.user_id = c.assigned_agent_id
      left join support_tickets t on t.id = c.ticket_id
    where ${where(f)}
    order by c.created_at desc
    limit ${limit}`);
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  const secs = (a: unknown, b: unknown) => (a && b ? Math.max(0, Math.round((new Date(String(b)).getTime() - new Date(String(a)).getTime()) / 1000)) : null);
  return rows.rows.map((r) => ({
    id: String(r.id), source: String(r.source), requesterType: String(r.requester_type), name: String(r.name), contact: (r.contact as string | null) ?? null,
    topic: supportCategoryLabel(String(r.topic)), agent: (r.agent as string | null) ?? null,
    createdAt: iso(r.created_at)!, acceptedAt: iso(r.accepted_at), firstReplyAt: iso(r.first_agent_reply_at), endedAt: iso(r.ended_at),
    waitSeconds: secs(r.created_at, r.accepted_at), firstReplySeconds: secs(r.accepted_at, r.first_agent_reply_at), durationSeconds: secs(r.accepted_at, r.ended_at),
    messages: Number(r.messages), files: Number(r.files), status: String(r.status), endReason: (r.end_reason as string | null) ?? null, endedBy: (r.ended_by as string | null) ?? null,
    rating: r.rating === null ? null : Number(r.rating), ratingNote: (r.rating_note as string | null) ?? null, ticketNumber: r.ticket_number === null ? null : Number(r.ticket_number),
  }));
}

const OUTCOME: Record<string, string> = { RESOLVED: "Resolved", ABANDONED: "Left before answer", IDLE: "Timed out", TICKET: "Saved as support request" };
const IST = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "");

/** CSV (opens in Excel / Google Sheets). Cells that start like a formula are escaped so a typed name can't run as one. */
export function liveChatReportCsv(rows: LiveChatReportRow[]): string {
  const head = ["Chat ID", "Started (IST)", "From", "Type", "Name", "Contact", "Topic", "Agent", "Picked up (IST)", "Ended (IST)", "Wait (sec)", "First reply (sec)", "Duration (min)", "Messages", "Files", "Outcome", "Ended by", "Rating (1-5)", "Feedback", "Support request #"];
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.id, IST(r.createdAt), r.source === "SELLER" ? "Seller centre" : "Store", r.requesterType === "SELLER" ? "Seller" : r.requesterType === "GUEST" ? "Guest" : "Customer",
    r.name, r.contact, r.topic, r.agent, IST(r.acceptedAt), IST(r.endedAt), r.waitSeconds, r.firstReplySeconds,
    r.durationSeconds === null ? "" : (r.durationSeconds / 60).toFixed(1), r.messages, r.files,
    r.status !== "ENDED" ? "Open" : r.endReason === "ABANDONED" && !r.acceptedAt ? "Missed (no agent in time)" : OUTCOME[r.endReason ?? ""] ?? r.endReason ?? "",
    r.endedBy === "REQUESTER" ? "Customer/seller" : r.endedBy === "AGENT" ? "Agent" : r.endedBy === "SYSTEM" ? "System" : "",
    r.rating, r.ratingNote, r.ticketNumber,
  ].map(cell).join(","));
  // BOM so Excel reads ₹ and Indian-language names correctly.
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}
