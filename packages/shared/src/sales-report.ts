import { GST_STATE_CODES } from "./gst";

/** Every Indian state and union territory, by its official name. */
export const INDIAN_STATES = Object.keys(GST_STATE_CODES).sort();
export const SALES_REPORT_PERIODS = [7, 30, 90] as const;
export type SalesReportPeriod = (typeof SALES_REPORT_PERIODS)[number];

const IST_OFFSET_MS = 330 * 60 * 1000;
const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, "and").replace(/[.,]/g, "").replace(/\s+/g, " ");
const ALIASES: Record<string, string> = {
  orissa: "Odisha", pondicherry: "Puducherry", "new delhi": "Delhi", "nct of delhi": "Delhi", "delhi ncr": "Delhi",
  "jandk": "Jammu and Kashmir", "j and k": "Jammu and Kashmir", uttaranchal: "Uttarakhand", "andaman and nicobar": "Andaman and Nicobar Islands",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu", "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  ap: "Andhra Pradesh", ts: "Telangana", tn: "Tamil Nadu", up: "Uttar Pradesh", mp: "Madhya Pradesh", wb: "West Bengal",
};

/** The official state name for what a shopper typed ("tamil nadu", "Orissa", "AP"), or null if it isn't one. */
export function canonicalState(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = norm(name);
  return INDIAN_STATES.find((s) => norm(s) === key) ?? ALIASES[key] ?? null;
}

/** "2026-10-26": the India-time calendar day of a moment. */
export const istDay = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
/** Midnight India time at the start of the day `daysAgo` days before `now`. */
export function istDayStartAgo(now: Date, daysAgo: number) {
  return new Date(Date.parse(istDay(now) + "T00:00:00Z") - daysAgo * 86_400_000 - IST_OFFSET_MS);
}
/** The last `days` India-time days, oldest first, ending today. */
export function istDays(now: Date, days: number) {
  return Array.from({ length: days }, (_, i) => istDay(new Date(istDayStartAgo(now, days - 1 - i).getTime() + IST_OFFSET_MS + 1)));
}
