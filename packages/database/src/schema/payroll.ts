import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./identity";

export type PayLineRow = { code: string; label: string; amountPaise: number };

/**
 * LOIMART's own employees (payroll). Salary details are confidential: only
 * team members with the "payroll" area can read them; an employee sees only
 * their own payslips. PAN and bank account numbers are stored encrypted.
 */
export const employees = pgTable(
  "employees",
  {
    id,
    /** Their LOIMART login once invited (payslip self-service). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    employeeCode: text("employee_code").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    designation: text("designation").notNull(),
    department: text("department"),
    dateOfJoining: date("date_of_joining").notNull(),
    dateOfExit: date("date_of_exit"),
    isActive: boolean("is_active").notNull().default(true),
    monthlyCtcPaise: integer("monthly_ctc_paise").notNull(),
    workState: text("work_state").notNull(),
    metroCity: boolean("metro_city").notNull().default(false),
    pfEnabled: boolean("pf_enabled").notNull().default(true),
    esiEnabled: boolean("esi_enabled").notNull().default(true),
    panEncrypted: text("pan_encrypted"),
    panLast4: text("pan_last4"),
    uan: text("uan"),
    esiNumber: text("esi_number"),
    bankAccountEncrypted: text("bank_account_encrypted"),
    bankAccountLast4: text("bank_account_last4"),
    ifsc: text("ifsc"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("employees_code_unique").on(table.employeeCode),
    uniqueIndex("employees_email_unique").on(table.email),
    uniqueIndex("employees_user_unique").on(table.userId),
  ],
);

/** One month's payroll: DRAFT while HR adjusts it, FINALISED when payslips are issued (locked), PAID when salaries are sent. */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id,
    month: text("month").notNull(), // "2026-10"
    status: text("status").$type<"DRAFT" | "FINALISED" | "PAID">().notNull().default("DRAFT"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    finalisedByUserId: uuid("finalised_by_user_id").references(() => users.id),
    finalisedAt: timestamp("finalised_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentReference: text("payment_reference"),
    ...timestamps,
  },
  (table) => [uniqueIndex("payroll_runs_month_unique").on(table.month)],
);

/** What a payslip shows about the employee and company, frozen when it is calculated. */
export type PayslipDetails = {
  employee: { code: string; name: string; designation: string; department: string | null; dateOfJoining: string; workState: string; panLast4: string | null; uan: string | null; esiNumber: string | null; bankLast4: string | null; ifsc: string | null };
  company: { legalName: string; address: string };
  monthlyCtcPaise: number;
};

export const payslips = pgTable(
  "payslips",
  {
    id,
    runId: uuid("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
    month: text("month").notNull(),
    daysInMonth: integer("days_in_month").notNull(),
    paidDays: numeric("paid_days", { precision: 5, scale: 1 }).notNull(),
    lopDays: numeric("lop_days", { precision: 5, scale: 1 }).notNull().default("0"),
    earnings: jsonb("earnings").$type<PayLineRow[]>().notNull(),
    deductions: jsonb("deductions").$type<PayLineRow[]>().notNull(),
    employerContributions: jsonb("employer_contributions").$type<PayLineRow[]>().notNull().default([]),
    /** HR's adjustments that the lines were calculated from (so they can be edited again while DRAFT). */
    adjustments: jsonb("adjustments").$type<{ extraEarnings: Array<{ label: string; amountPaise: number }>; extraDeductions: Array<{ label: string; amountPaise: number }>; tdsOverridePaise: number | null; note: string | null }>().notNull(),
    grossPaise: integer("gross_paise").notNull(),
    totalDeductionsPaise: integer("total_deductions_paise").notNull(),
    netPaise: integer("net_paise").notNull(),
    details: jsonb("details").$type<PayslipDetails>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payslips_run_employee_unique").on(table.runId, table.employeeId),
    index("payslips_employee_idx").on(table.employeeId),
  ],
);
