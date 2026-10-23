// Payments (TECH_PLAN §11): a paid drop, an upgrade (more Tikkas than the tier holds) or a
// season pack. The same rules complete_payment follows in Postgres, as pure functions over plain
// records. The demo store uses them until M1, and the tests pin the behaviour the database
// functions must match.

export type PaymentStatus = "pending" | "paid" | "failed" | "abandoned";
export type PaymentKind = "drop" | "upgrade" | "pack";

export interface Payment {
  id: string;
  businessId: string;
  kind: PaymentKind;
  dropId?: string;
  packId?: string;
  fromTier?: string;
  toTier?: string;
  /** Upgrade payments: how many Tikkas to add once it's paid. */
  extraCards?: number;
  amountKobo: number;
  reference: string;
  status: PaymentStatus;
  createdAt: string;
  paidAt?: string;
}

export const ABANDON_AFTER_MS = 60 * 60 * 1000;

export type CompleteEffect =
  | { effect: "none"; reason: "unknown" | "already_paid" | "not_pending" }
  | { effect: "failed"; payment: Payment }
  | { effect: PaymentKind; payment: Payment };

/**
 * complete_payment(reference, amount): idempotent. Unknown or already settled → nothing.
 * Wrong amount → mark failed, change nothing else. Otherwise mark paid and say what to do next
 * (publish the drop, append the upgrade's Tikkas, or create the pack's drops), which the caller
 * does in the same transaction.
 */
export function completePayment(
  payments: Payment[],
  reference: string,
  amountKobo: number,
  now: Date,
): { payments: Payment[]; result: CompleteEffect } {
  const i = payments.findIndex((p) => p.reference === reference);
  if (i < 0) return { payments, result: { effect: "none", reason: "unknown" } };
  const p = payments[i];
  if (p.status === "paid") return { payments, result: { effect: "none", reason: "already_paid" } };
  if (p.status !== "pending") return { payments, result: { effect: "none", reason: "not_pending" } };

  const next = [...payments];
  if (amountKobo !== p.amountKobo) {
    next[i] = { ...p, status: "failed" };
    return { payments: next, result: { effect: "failed", payment: next[i] } };
  }
  next[i] = { ...p, status: "paid", paidAt: now.toISOString() };
  return { payments: next, result: { effect: p.kind, payment: next[i] } };
}

/** The cron: pending payments older than an hour become abandoned; their drops stay drafts. */
export function abandonStale(payments: Payment[], now: Date): Payment[] {
  return payments.map((p) =>
    p.status === "pending" && now.getTime() - new Date(p.createdAt).getTime() > ABANDON_AFTER_MS ? { ...p, status: "abandoned" } : p,
  );
}

/** Where the owner lands once a payment is paid, and the way back if it isn't. */
export function paymentPlace(p: Payment): { done: string; back: { href: string; label: string } } {
  if (p.kind === "pack") return { done: "/app/settings/payments?pack=1", back: { href: "/app/settings/payments", label: "Back to payments" } };
  if (p.kind === "upgrade") return { done: `/app/drops/${p.dropId}?added=${p.extraCards ?? 0}`, back: { href: `/app/drops/${p.dropId}`, label: "Back to the drop" } };
  return { done: `/app/drops/${p.dropId}?published=1`, back: { href: `/app/drops/${p.dropId}`, label: "Back to the drop" } };
}

export function newReference(): string {
  return `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Leads go to owners only (rule 4). Staff and anonymous callers get an error, never a number. */
export function assertCanReadLeads(role: "owner" | "staff" | null): void {
  if (role !== "owner") throw new Error("Only the business owner can see leads.");
}
