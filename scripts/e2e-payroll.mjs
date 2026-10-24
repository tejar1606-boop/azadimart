// End-to-end test for the Payroll app: HR adds employees (PAN / bank stored
// encrypted), gives one a login, runs a month's payroll (PF, ESI, PT, TDS,
// LOP, bonus), finalises it, downloads the bank sheet and marks it paid. The
// employee sees only their own issued payslips and nothing else. Requires the
// demo seed and the payroll app against a NON-PRODUCTION database.
//   ALLOW_E2E=YES PAYROLL_URL=… pnpm e2e:payroll
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const PR = process.env.PAYROLL_URL ?? "http://localhost:3004";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'login:%' or key like 'ip:%'`;
await sql`delete from login_attempts where created_at > now() - interval '1 hour'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client() {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: PR };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(PR + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
}
const hr = client(), emp = client(), seller = client();
const RUN = Date.now().toString(36);
const MONTH = "2019-11";
const created = { employees: [], users: [] };
async function tidy() {
  await sql`delete from payroll_runs where month = ${MONTH}`;
  if (created.employees.length) await sql`delete from employees where id = any(${created.employees}::uuid[])`;
  await sql`delete from sessions where user_id in (select id from users where email like ${"e2e.emp." + RUN + "%"})`;
  // Test logins stay (the audit log points at them) but are switched off.
  await sql`update users set status = 'DISABLED', password_hash = null where email like ${"e2e.emp." + RUN + "%"} and role = 'EMPLOYEE'`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
await sql`delete from payroll_runs where month = ${MONTH}`;

// --- who may sign in
let r = await hr("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
check("HR (admin) signs in to Payroll and lands on Monthly payroll", r.status === 200 && r.json?.home === "/payroll", JSON.stringify(r.json?.error ?? r.json));
r = await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
check("a seller account can't sign in to Payroll", r.status === 401 || r.status === 403, String(r.status));

// --- employees
const e1 = { fullName: "E2E Asha Rao", email: `e2e.emp.${RUN}.a@loimart.test`, designation: "Support executive", department: "Operations", dateOfJoining: "2019-01-01", monthlyCtcPaise: 5000000, workState: "Andhra Pradesh", metroCity: false, pfEnabled: true, esiEnabled: true, pan: "ABCDE1234F", uan: "100200300400", bankAccountNumber: "123456789012", ifsc: "HDFC0001234" };
const e2 = { ...e1, fullName: "E2E Ravi Kumar", email: `e2e.emp.${RUN}.b@loimart.test`, monthlyCtcPaise: 1800000, workState: "Karnataka", pan: "", uan: "", bankAccountNumber: "987654321098" };
r = await hr("/api/v1/employees", { method: "POST", body: { ...e1, pan: "BAD" } });
check("an invalid PAN is refused", r.status === 400);
r = await hr("/api/v1/employees", { method: "POST", body: e1 });
const id1 = r.json?.employee?.id; if (id1) created.employees.push(id1);
check("HR adds an employee with an LM code", r.status === 201 && /^LM\d{4}$/.test(r.json.employee.employeeCode), JSON.stringify(r.json?.error ?? r.json?.employee));
r = await hr("/api/v1/employees", { method: "POST", body: e2 });
const id2 = r.json?.employee?.id; if (id2) created.employees.push(id2);
check("…and a second (low salary, ESI)", r.status === 201);
r = await hr("/api/v1/employees", { method: "POST", body: e1 });
check("the same email can't be added twice", r.status === 409);
const [stored] = await sql`select pan_encrypted, pan_last4, bank_account_encrypted, bank_account_last4 from employees where id = ${id1}`;
check("PAN and bank account are stored encrypted (only last 4 readable)", stored.pan_encrypted?.startsWith("v1:") && !stored.pan_encrypted.includes("ABCDE") && stored.pan_last4 === "234F" && stored.bank_account_last4 === "9012" && !stored.bank_account_encrypted.includes("123456789012"));
r = await hr(`/api/v1/employees/${id1}`);
check("the edit form never receives the full PAN or account number", r.status === 200 && !("panEncrypted" in r.json.employee) && !r.text.includes("123456789012") && !r.text.includes("ABCDE1234F"));

// --- login for the employee
r = await hr(`/api/v1/employees/${id1}/login`, { method: "POST", body: { password: "short" } });
check("a short password is refused", r.status === 400);
r = await hr(`/api/v1/employees/${id1}/login`, { method: "POST", body: { password: "Loi-Test-Pass-123" } });
check("HR creates the employee's payslip login", r.status === 200 && r.json?.mode === "created", JSON.stringify(r.json?.error ?? r.json));
r = await emp("/api/auth/login", { method: "POST", body: { email: e1.email, password: "Loi-Test-Pass-123" } });
check("the employee signs in and lands on My payslips", r.status === 200 && r.json?.home === "/my", JSON.stringify(r.json?.error ?? r.json));

// --- payroll run
r = await hr("/api/v1/runs", { method: "POST", body: { month: MONTH } });
const runId = r.json?.run?.id;
check("HR starts the month's payroll", r.status === 201 && Boolean(runId), JSON.stringify(r.json?.error ?? ""));
r = await hr("/api/v1/runs", { method: "POST", body: { month: MONTH } });
check("…only once per month", r.status === 409);
r = await hr(`/api/v1/runs/${runId}`);
const s1 = r.json?.items?.find((s) => s.employeeId === id1), s2 = r.json?.items?.find((s) => s.employeeId === id2);
const ded = (s, code) => s?.deductions?.find((d) => d.code === code)?.amountPaise ?? 0;
check("a payslip for each employee", Boolean(s1 && s2), String(r.json?.items?.length));
check("₹50,000 CTC: PF ₹1,800, AP professional tax ₹200, net = gross − deductions", ded(s1, "PF") === 180000 && ded(s1, "PT") === 20000 && s1.netPaise === s1.grossPaise - s1.totalDeductionsPaise, JSON.stringify(s1?.deductions));
check("₹18,000 CTC: ESI is deducted", ded(s2, "ESI") > 0, JSON.stringify(s2?.deductions));
const before = s2.netPaise;

r = await emp("/api/v1/my/payslips");
check("employees can't see a draft month", r.status === 200 && r.json.items.length === 0);
check("…or open a draft payslip", (await emp(`/api/v1/payslips/${s1.id}`)).status === 404);
check("employees can't open HR screens", [401, 403].includes((await emp("/api/v1/employees")).status) && [401, 403].includes((await emp(`/api/v1/runs/${runId}`)).status));
check("employees can't adjust payslips", [401, 403].includes((await emp(`/api/v1/payslips/${s1.id}`, { method: "PATCH", body: { lopDays: 0 } })).status));

r = await hr(`/api/v1/payslips/${s2.id}`, { method: "PATCH", body: { lopDays: 2, extraEarnings: [{ label: "Diwali bonus", amountPaise: 100000 }], extraDeductions: [], tdsOverridePaise: null } });
check("HR adds 2 LOP days and a bonus; the payslip is recalculated", r.status === 200 && Number(r.json.payslip.paidDays) === 28 && r.json.payslip.earnings.some((e) => e.label === "Diwali bonus") && r.json.payslip.netPaise !== before, JSON.stringify(r.json?.error ?? { paid: r.json?.payslip?.paidDays }));

r = await hr(`/api/v1/runs/${runId}/bank-file`);
check("no bank sheet before finalising", r.status === 409);
r = await hr(`/api/v1/runs/${runId}`, { method: "PATCH", body: { action: "FINALISE" } });
check("HR finalises the month", r.status === 200);
r = await hr(`/api/v1/payslips/${s2.id}`, { method: "PATCH", body: { lopDays: 0, extraEarnings: [], extraDeductions: [], tdsOverridePaise: null } });
check("issued payslips are locked", r.status === 409);
r = await emp("/api/v1/my/payslips");
check("the employee now sees their payslip", r.json?.items?.length === 1 && r.json.items[0].id === s1.id);
r = await emp(`/api/v1/payslips/${s1.id}`);
check("…and can open it", r.status === 200 && r.json.payslip.netPaise === s1.netPaise && r.json.payslip.details.employee.panLast4 === "234F");
check("…but never a colleague's", (await emp(`/api/v1/payslips/${s2.id}`)).status === 404);

r = await hr(`/api/v1/runs/${runId}/bank-file`);
check("bank sheet lists full account numbers and net pay", r.status === 200 && r.text.includes("123456789012") && r.text.includes("987654321098") && r.text.includes((s1.netPaise / 100).toFixed(2)));
check("employees can't download the bank sheet", [401, 403].includes((await emp(`/api/v1/runs/${runId}/bank-file`)).status));
const [audit] = await sql`select count(*)::int n from audit_logs where action = 'PAYROLL_BANK_FILE_DOWNLOADED' and entity_id = ${runId}`;
check("every bank sheet download is logged", audit.n >= 1);
r = await hr(`/api/v1/runs/${runId}`, { method: "PATCH", body: { action: "PAID", paymentReference: "E2E-UTR-1" } });
check("HR marks salaries paid", r.status === 200);
check("a paid month can't be deleted", (await hr(`/api/v1/runs/${runId}`, { method: "DELETE" })).status === 409);

// --- employee changes their password
r = await emp("/api/v1/my/password", { method: "POST", body: { currentPassword: "wrong-password", newPassword: "Loi-New-Pass-456" } });
check("wrong current password is refused", r.status === 400);
r = await emp("/api/v1/my/password", { method: "POST", body: { currentPassword: "Loi-Test-Pass-123", newPassword: "Loi-New-Pass-456" } });
check("the employee changes their password", r.status === 200);
const again = client();
check("…and signs in with the new one", (await again("/api/auth/login", { method: "POST", body: { email: e1.email, password: "Loi-New-Pass-456" } })).status === 200);

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
