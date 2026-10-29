import { z } from "zod";

/**
 * Indian monthly payroll from an employee's CTC (cost to company).
 *
 * Structure (monthly):
 * - Basic = 50% of CTC (the new labour codes expect wages to be at least half of pay).
 * - HRA = 50% of Basic in metro cities, 40% elsewhere.
 * - Employer PF = 12% of Basic, on Basic up to the ₹15,000 wage ceiling (when PF applies).
 * - Employer ESI = 3.25% of gross, only when gross is ₹21,000 or less.
 * - Special allowance = the rest, so gross + employer contributions = CTC.
 * Deductions: employee PF 12%, employee ESI 0.75%, Professional Tax (by state),
 * and TDS (new tax regime, spread evenly over the year).
 * Loss of pay (LOP) days reduce every earning by paid days / days in month.
 *
 * Rates are those in force as of FY 2025-26; LOIMART's CA must confirm them
 * (and update Professional Tax slabs) before the first real payroll.
 */

export const PF_RATE_BPS = 1200;
export const PF_WAGE_CEILING_PAISE = 15_000_00;
export const ESI_EMPLOYEE_BPS = 75;
export const ESI_EMPLOYER_BPS = 325;
export const ESI_GROSS_LIMIT_PAISE = 21_000_00;
export const NEW_REGIME_STANDARD_DEDUCTION_PAISE = 75_000_00;
/** New regime slabs (annual taxable income, rupees) and rates. */
export const NEW_REGIME_SLABS: Array<[upTo: number, rateBps: number]> = [[4_00_000, 0], [8_00_000, 500], [12_00_000, 1000], [16_00_000, 1500], [20_00_000, 2000], [24_00_000, 2500], [Infinity, 3000]];
/** Section 87A: no tax when taxable income is up to ₹12 lakh (new regime). */
export const REBATE_LIMIT_PAISE = 12_00_000_00;
export const CESS_BPS = 400;

const pct = (paise: number, bps: number) => Math.round((paise * bps) / 10_000);
const rupees = (paise: number) => paise / 100;

/** Monthly Professional Tax by state (gross salary in paise → tax in paise). */
export function professionalTax(state: string | null | undefined, grossPaise: number, month: number): number {
  const g = rupees(grossPaise);
  switch ((state ?? "").trim().toLowerCase()) {
    case "andhra pradesh": return g > 20000 ? 20000 : g > 15000 ? 15000 : 0;
    case "telangana": return g > 20000 ? 20000 : g > 15000 ? 15000 : 0;
    case "karnataka": return g >= 25000 ? 20000 : 0;
    case "maharashtra": return g > 10000 ? (month === 2 ? 30000 : 20000) : g > 7500 ? 17500 : 0;
    case "tamil nadu": return g > 12500 ? 20800 : g > 10000 ? 17100 : g > 7500 ? 11500 : g > 5000 ? 5300 : g > 3500 ? 2250 : 0;
    case "west bengal": return g > 40000 ? 20000 : g > 25000 ? 15000 : g > 15000 ? 13000 : g > 10000 ? 11000 : 0;
    case "gujarat": return g >= 12000 ? 20000 : 0;
    case "kerala": return g >= 12000 ? 20800 : 0; // half-yearly ₹1,250 spread monthly (approx.)
    case "madhya pradesh": return g > 25000 ? 20800 : g > 18750 ? 12500 : 0;
    case "odisha": return g > 25000 ? 20000 : g > 13304 ? 12500 : 0;
    default: return 0; // Delhi, Uttar Pradesh, Haryana, Rajasthan and others have no Professional Tax
  }
}

/** Annual income tax (paise) under the new regime on annual taxable income (paise). */
export function newRegimeTax(taxablePaise: number): number {
  if (taxablePaise <= REBATE_LIMIT_PAISE) return 0;
  const income = rupees(taxablePaise);
  let tax = 0, lower = 0;
  for (const [upTo, rate] of NEW_REGIME_SLABS) {
    if (income > lower) tax += (Math.min(income, upTo) - lower) * rate / 10_000;
    lower = upTo;
  }
  // Marginal relief just above ₹12 lakh: tax can't exceed the income above the limit.
  tax = Math.min(tax, income - REBATE_LIMIT_PAISE / 100);
  return Math.round(tax * (1 + CESS_BPS / 10_000) * 100);
}

export type PayLine = { code: string; label: string; amountPaise: number };
export type PayrollEmployee = {
  monthlyCtcPaise: number;
  workState: string | null;
  metroCity: boolean;
  pfEnabled: boolean;
  esiEnabled: boolean;
};
export type PayrollInput = {
  year: number; month: number; // month 1-12
  lopDays: number;
  /** One-off earnings this month (bonus, arrears, reimbursements) and other deductions (advance recovery …). */
  extraEarnings?: PayLine[];
  extraDeductions?: PayLine[];
  /** Overrides TDS for the month (e.g. after an investment declaration). */
  tdsOverridePaise?: number | null;
};
export type Payslip = {
  daysInMonth: number; paidDays: number; lopDays: number;
  earnings: PayLine[]; deductions: PayLine[]; employerContributions: PayLine[];
  grossPaise: number; totalDeductionsPaise: number; netPaise: number; ctcPaise: number;
};

/** Monthly salary structure at full attendance: basic, HRA, special allowance and employer contributions. */
export function salaryStructure(e: PayrollEmployee) {
  const ctc = Math.max(0, Math.round(e.monthlyCtcPaise));
  const basic = Math.round(ctc * 0.5);
  const hra = pct(basic, e.metroCity ? 5000 : 4000);
  const employerPf = e.pfEnabled ? pct(Math.min(basic, PF_WAGE_CEILING_PAISE), PF_RATE_BPS) : 0;
  // ESI depends on gross, which depends on ESI: solve gross = (CTC − employer PF) / (1 + 3.25%) when it applies.
  let gross = ctc - employerPf;
  let employerEsi = 0;
  if (e.esiEnabled) {
    const withEsi = Math.round(gross / (1 + ESI_EMPLOYER_BPS / 10_000));
    if (withEsi <= ESI_GROSS_LIMIT_PAISE) { gross = withEsi; employerEsi = ctc - employerPf - gross; }
  }
  const special = Math.max(0, gross - basic - hra);
  return { ctc, basic, hra, special, gross: basic + hra + special, employerPf, employerEsi };
}

export function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

/** One month's payslip lines. */
export function calculatePayslip(e: PayrollEmployee, input: PayrollInput): Payslip {
  const days = daysInMonth(input.year, input.month);
  const lop = Math.min(days, Math.max(0, input.lopDays));
  const paidDays = days - lop;
  const factor = paidDays / days;
  const s = salaryStructure(e);
  const basic = Math.round(s.basic * factor), hra = Math.round(s.hra * factor), special = Math.round(s.special * factor);
  const extraEarnings = (input.extraEarnings ?? []).filter((l) => l.amountPaise > 0);
  const earnings: PayLine[] = [
    { code: "BASIC", label: "Basic", amountPaise: basic },
    { code: "HRA", label: "House rent allowance", amountPaise: hra },
    { code: "SPECIAL", label: "Special allowance", amountPaise: special },
    ...extraEarnings,
  ].filter((l) => l.amountPaise > 0 || ["BASIC", "HRA", "SPECIAL"].includes(l.code));
  const gross = earnings.reduce((n, l) => n + l.amountPaise, 0);
  const regularGross = basic + hra + special;

  const pfWage = Math.min(basic, PF_WAGE_CEILING_PAISE);
  const employeePf = e.pfEnabled ? pct(pfWage, PF_RATE_BPS) : 0;
  // ESI eligibility is decided on regular monthly wages at full attendance (bonus doesn't push someone out).
  const esiApplies = e.esiEnabled && s.gross <= ESI_GROSS_LIMIT_PAISE;
  const employeeEsi = esiApplies ? Math.ceil((gross * ESI_EMPLOYEE_BPS) / 10_000) : 0;
  const pt = professionalTax(e.workState, regularGross, input.month);
  // TDS: this year's projected taxable salary (regular pay × 12 + this month's extras), tax spread over 12 months.
  const annualTaxable = Math.max(0, s.gross * 12 + extraEarnings.reduce((n, l) => n + l.amountPaise, 0) - NEW_REGIME_STANDARD_DEDUCTION_PAISE);
  const tds = input.tdsOverridePaise != null ? Math.max(0, input.tdsOverridePaise) : Math.round(newRegimeTax(annualTaxable) / 12);

  const deductions: PayLine[] = [
    ...(employeePf ? [{ code: "PF", label: "Provident fund (12%)", amountPaise: employeePf }] : []),
    ...(employeeEsi ? [{ code: "ESI", label: "ESI (0.75%)", amountPaise: employeeEsi }] : []),
    ...(pt ? [{ code: "PT", label: "Professional tax", amountPaise: pt }] : []),
    ...(tds ? [{ code: "TDS", label: "Income tax (TDS)", amountPaise: tds }] : []),
    ...(input.extraDeductions ?? []).filter((l) => l.amountPaise > 0),
  ];
  const employerContributions: PayLine[] = [
    ...(e.pfEnabled ? [{ code: "EPF_ER", label: "Employer PF (12%)", amountPaise: pct(pfWage, PF_RATE_BPS) }] : []),
    ...(esiApplies ? [{ code: "ESI_ER", label: "Employer ESI (3.25%)", amountPaise: Math.ceil((gross * ESI_EMPLOYER_BPS) / 10_000) }] : []),
  ];
  const totalDeductions = deductions.reduce((n, l) => n + l.amountPaise, 0);
  return {
    daysInMonth: days, paidDays, lopDays: lop, earnings, deductions, employerContributions,
    grossPaise: gross, totalDeductionsPaise: totalDeductions, netPaise: gross - totalDeductions,
    ctcPaise: gross + employerContributions.reduce((n, l) => n + l.amountPaise, 0),
  };
}

// ---------- validation
const money = z.number().int().min(0).max(1_00_00_000_00); // up to ₹1 crore a month
export const PAYROLL_STATES = ["Andhra Pradesh", "Telangana", "Karnataka", "Maharashtra", "Tamil Nadu", "West Bengal", "Gujarat", "Kerala", "Madhya Pradesh", "Odisha", "Delhi", "Uttar Pradesh", "Haryana", "Rajasthan", "Punjab", "Bihar", "Other"] as const;
const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
export const employeeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number").nullable().optional()),
  designation: z.string().trim().min(2).max(80),
  department: optionalText(80),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the joining date"),
  monthlyCtcPaise: money.refine((v) => v > 0, "Enter the monthly CTC"),
  workState: z.string().trim().min(2).max(60),
  metroCity: z.boolean().default(false),
  pfEnabled: z.boolean().default(true),
  esiEnabled: z.boolean().default(true),
  pan: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN").nullable().optional()),
  uan: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().regex(/^\d{12}$/, "UAN is 12 digits").nullable().optional()),
  esiNumber: optionalText(20),
  bankAccountNumber: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().regex(/^\d{9,18}$/, "Account number is 9–18 digits").optional()),
  ifsc: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC").nullable().optional()),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

const payLineInput = z.object({ label: z.string().trim().min(2).max(60), amountPaise: money.refine((v) => v > 0, "Enter an amount") });
export const payslipAdjustSchema = z.object({
  lopDays: z.number().min(0).max(31),
  extraEarnings: z.array(payLineInput).max(8).default([]),
  extraDeductions: z.array(payLineInput).max(8).default([]),
  tdsOverridePaise: money.nullable().default(null),
  note: optionalText(300),
});
export const payrollMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month");
