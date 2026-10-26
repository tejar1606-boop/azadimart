/**
 * How long each side has at each step of a return (from when it reached that
 * step). A seller who doesn't reply in time has the return approved by
 * LOIMART automatically; later steps are flagged as late (LOIMART steps in).
 */
export const RETURN_DEADLINES = {
  /** Seller approves or rejects a new request. */
  replyHours: 48,
  /** Seller books the pickup after approving. */
  bookPickupDays: 2,
  /** Seller marks the item received after the pickup is booked. */
  receiveDays: 7,
  /** LOIMART refunds the customer once the item is back. */
  refundDays: 2,
} as const;

const HOUR = 60 * 60 * 1000;
export type ReturnDeadline = { who: "SELLER" | "LOIMART"; task: string; late: string; dueAt: Date; overdue: boolean };

/** The deadline for a return at its current step, or null when nothing is waiting (refunded/rejected). */
export function returnDeadline(status: string, since: Date | string, now = new Date()): ReturnDeadline | null {
  const start = new Date(since).getTime();
  const at = (hours: number, who: ReturnDeadline["who"], task: string, late: string) => {
    const dueAt = new Date(start + hours * HOUR);
    return { who, task, late, dueAt, overdue: now.getTime() > dueAt.getTime() };
  };
  switch (status) {
    case "REQUESTED": return at(RETURN_DEADLINES.replyHours, "SELLER", "Approve or reject", "Seller hasn't replied");
    case "APPROVED": return at(RETURN_DEADLINES.bookPickupDays * 24, "SELLER", "Book the pickup", "Pickup not booked");
    case "PICKUP_SCHEDULED": return at(RETURN_DEADLINES.receiveDays * 24, "SELLER", "Mark the item received", "Not marked received");
    case "RECEIVED": return at(RETURN_DEADLINES.refundDays * 24, "LOIMART", "Refund the customer", "Refund overdue");
    default: return null;
  }
}
