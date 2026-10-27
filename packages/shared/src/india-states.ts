/** States and union territories, as shown in address forms. */
export const INDIA_STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"] as const;

const squash = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
const ALIASES: Record<string, string> = { nationalcapitalterritoryofdelhi: "Delhi", newdelhi: "Delhi", orissa: "Odisha", pondicherry: "Puducherry", uttaranchal: "Uttarakhand", dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu", damananddiu: "Dadra and Nagar Haveli and Daman and Diu" };

/** Maps a state name from a map or postal lookup ("Orissa", "NCT of Delhi") to our list, or "" if unknown. */
export function matchIndiaState(name: string | null | undefined): string {
  if (!name) return "";
  const key = squash(name);
  return INDIA_STATES.find((s) => squash(s) === key) ?? ALIASES[key] ?? (key.includes("delhi") ? "Delhi" : "");
}
