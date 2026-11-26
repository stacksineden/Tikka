// NEW DIRECTION: receipts, proof of payment the owner sends a customer (not a tax invoice). Pure, so
// the receipt page and the tests agree. A receipt is worked out from its sale each time it's opened,
// so a balance paid later shows on the same receipt. Amounts are kobo.

import type { Booking } from "./bookings";
import { METHOD_LABEL, owedOf, paidOf, type Sale } from "./ledger";

export interface ReceiptLine {
  label: string;
  /** When it was paid (ISO). */
  at: string;
  kobo: number;
}

export interface ReceiptView {
  number: string;
  /** When the sale (or the booked visit) happened. */
  at: string;
  customer: string;
  item: string;
  detail?: string;
  homeArea?: string;
  /** Asked for on the day, already in the total: shown as its own line. */
  added?: { label: string; kobo: number };
  totalKobo: number;
  payments: ReceiptLine[];
  paidKobo: number;
  owedKobo: number;
}

/** "R-0007": the owner's receipts, numbered from 1. */
export const receiptNumber = (n: number) => `R-${String(Math.max(1, n)).padStart(4, "0")}`;

/**
 * What a receipt shows. A booking's deposit paid online comes first; the total is the deposit plus
 * what was due at the visit when the deposit counts towards the bill, else just what was due.
 */
export function buildReceipt(sale: Sale, booking: Booking | null, n: number): ReceiptView {
  const deposit = booking?.depositPaidKobo ?? 0;
  const counts = booking?.depositCounts !== false;
  const payments: ReceiptLine[] = [];
  if (deposit) payments.push({ label: "Deposit, paid online", at: booking!.createdAt, kobo: deposit });
  for (const p of sale.payments) payments.push({ label: METHOD_LABEL[p.method], at: p.at, kobo: p.kobo });
  const paid = deposit + paidOf(sale);
  return {
    number: receiptNumber(n),
    at: booking?.startsAt ?? sale.at,
    customer: (booking?.firstName ?? sale.name).trim() || "Customer",
    item: booking?.service ?? sale.item,
    detail: booking?.detail,
    homeArea: booking?.homeArea,
    added: sale.added,
    totalKobo: sale.totalKobo + (deposit && counts ? deposit : 0),
    payments,
    paidKobo: paid,
    owedKobo: owedOf(sale),
  };
}

/** The WhatsApp message that goes with a receipt. */
export function receiptMessage(first: string, business: string, item: string, url: string): string {
  return `Hi${first ? ` ${first}` : ""}, here's your receipt from ${business} for ${item}: ${url}`;
}
