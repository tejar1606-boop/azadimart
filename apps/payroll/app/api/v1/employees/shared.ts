import { encryptSecret } from "@azadimart/auth";
import type { EmployeeInput } from "@azadimart/shared";

/** Database values for an employee form. PAN and bank account are encrypted; only their last 4 are kept readable. */
export function employeeValues(input: EmployeeInput) {
  return {
    fullName: input.fullName, email: input.email, phone: input.phone ?? null, designation: input.designation, department: input.department ?? null,
    dateOfJoining: input.dateOfJoining, monthlyCtcPaise: input.monthlyCtcPaise, workState: input.workState, metroCity: input.metroCity,
    pfEnabled: input.pfEnabled, esiEnabled: input.esiEnabled, uan: input.uan ?? null, esiNumber: input.esiNumber ?? null, ifsc: input.ifsc ?? null,
    ...(input.pan !== undefined ? { panEncrypted: input.pan ? encryptSecret(input.pan) : null, panLast4: input.pan ? input.pan.slice(-4) : null } : {}),
    ...(input.bankAccountNumber ? { bankAccountEncrypted: encryptSecret(input.bankAccountNumber), bankAccountLast4: input.bankAccountNumber.slice(-4) } : {}),
  };
}
