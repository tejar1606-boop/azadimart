import { describe, expect, it } from "vitest";
import { calculatePayslip, employeeSchema, newRegimeTax, professionalTax, salaryStructure } from "./payroll";

const emp = (ctc: number, over = {}) => ({ monthlyCtcPaise: ctc * 100, workState: "Andhra Pradesh", metroCity: false, pfEnabled: true, esiEnabled: true, ...over });
const sum = (lines: Array<{ amountPaise: number }>) => lines.reduce((n, l) => n + l.amountPaise, 0);

describe("salary structure from CTC", () => {
  it("splits ₹50,000 CTC into basic, HRA, special and employer PF", () => {
    const s = salaryStructure(emp(50_000));
    expect(s.basic).toBe(25_000_00);
    expect(s.hra).toBe(10_000_00); // 40% of basic outside metros
    expect(s.employerPf).toBe(1_800_00); // 12% of the ₹15,000 ceiling
    expect(s.employerEsi).toBe(0); // gross above ₹21,000
    expect(s.gross + s.employerPf + s.employerEsi).toBe(50_000_00);
  });
  it("adds ESI for low salaries and still totals the CTC", () => {
    const s = salaryStructure(emp(18_000));
    expect(s.employerEsi).toBeGreaterThan(0);
    expect(s.gross).toBeLessThanOrEqual(21_000_00);
    expect(s.gross + s.employerPf + s.employerEsi).toBe(18_000_00);
  });
  it("metro HRA is 50% of basic", () => {
    expect(salaryStructure(emp(60_000, { metroCity: true })).hra).toBe(15_000_00);
  });
});

describe("monthly payslip", () => {
  it("full month: gross − deductions = net", () => {
    const p = calculatePayslip(emp(50_000), { year: 2026, month: 10, lopDays: 0 });
    expect(p.paidDays).toBe(31);
    expect(p.deductions.find((d) => d.code === "PF")?.amountPaise).toBe(1_800_00);
    expect(p.deductions.find((d) => d.code === "PT")?.amountPaise).toBe(200_00); // Andhra Pradesh, above ₹20,000
    expect(p.netPaise).toBe(p.grossPaise - sum(p.deductions));
    expect(p.ctcPaise).toBe(50_000_00);
  });
  it("loss of pay reduces earnings by paid days", () => {
    const full = calculatePayslip(emp(50_000), { year: 2026, month: 9, lopDays: 0 });
    const lop = calculatePayslip(emp(50_000), { year: 2026, month: 9, lopDays: 3 });
    expect(lop.paidDays).toBe(27);
    expect(lop.grossPaise).toBeLessThan(full.grossPaise);
    expect(Math.abs(lop.grossPaise - Math.round(full.grossPaise * 27 / 30))).toBeLessThanOrEqual(3);
  });
  it("bonus and other deductions are added", () => {
    const p = calculatePayslip(emp(50_000), { year: 2026, month: 10, lopDays: 0, extraEarnings: [{ code: "X", label: "Diwali bonus", amountPaise: 10_000_00 }], extraDeductions: [{ code: "Y", label: "Advance recovery", amountPaise: 2_000_00 }] });
    expect(p.earnings.some((e) => e.label === "Diwali bonus")).toBe(true);
    expect(p.deductions.some((d) => d.label === "Advance recovery")).toBe(true);
    expect(p.netPaise).toBe(p.grossPaise - p.totalDeductionsPaise);
  });
  it("no PF or ESI when switched off", () => {
    const p = calculatePayslip(emp(18_000, { pfEnabled: false, esiEnabled: false }), { year: 2026, month: 10, lopDays: 0 });
    expect(p.deductions.some((d) => d.code === "PF" || d.code === "ESI")).toBe(false);
    expect(p.employerContributions).toEqual([]);
  });
});

describe("taxes", () => {
  it("new regime: no tax up to ₹12 lakh taxable, slabs above", () => {
    expect(newRegimeTax(12_00_000_00)).toBe(0);
    // ₹16 lakh: 0 + 20k + 40k + 60k = ₹1,20,000 + 4% cess
    expect(newRegimeTax(16_00_000_00)).toBe(1_24_800_00);
    // just above ₹12 lakh, marginal relief caps the tax at the excess income (+ cess)
    expect(newRegimeTax(12_10_000_00)).toBe(10_400_00);
  });
  it("monthly TDS for ₹1.5 lakh/month CTC", () => {
    const p = calculatePayslip(emp(1_50_000), { year: 2026, month: 10, lopDays: 0 });
    expect(p.deductions.find((d) => d.code === "TDS")?.amountPaise).toBeGreaterThan(0);
  });
  it("Professional Tax by state", () => {
    expect(professionalTax("Karnataka", 30_000_00, 10)).toBe(200_00);
    expect(professionalTax("Maharashtra", 30_000_00, 2)).toBe(300_00); // February
    expect(professionalTax("Delhi", 90_000_00, 10)).toBe(0);
  });
});

describe("employee form", () => {
  it("validates PAN, IFSC and CTC", () => {
    const base = { fullName: "Asha Rao", email: "asha@loimart.test", designation: "Support executive", dateOfJoining: "2026-10-01", monthlyCtcPaise: 30_000_00, workState: "Andhra Pradesh" };
    expect(employeeSchema.safeParse(base).success).toBe(true);
    expect(employeeSchema.safeParse({ ...base, pan: "abcde1234f" }).success).toBe(true);
    expect(employeeSchema.safeParse({ ...base, pan: "BAD" }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...base, ifsc: "HDFC1234567" }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...base, monthlyCtcPaise: 0 }).success).toBe(false);
  });
});
