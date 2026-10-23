// The drop report (PRD B6, TECH_PLAN §12 get_drop_report): what a drop brought in, by its goal.
// Pure maths over the drop's redeemed Tikkas. Sales are "recorded" (what staff typed at the
// counter), never "earned"; reward costs are "estimated".

import { count, naira } from "./format";
import type { Goal } from "./templates";
import type { RewardType } from "./types";
import { validDaysLabel } from "./visit";

export interface ReportClaim {
  kind: "drop" | "bounce_back";
  redeemed: boolean;
  /** Bill typed at the counter, in kobo. */
  billKobo?: number;
  /** As marked at the counter. */
  customerStatus?: "new" | "returning";
  reward: { type: RewardType; value: number | null; costKobo?: number | null };
}

/** What the drop cost in Tikka fees: a payment, or one of the ways to publish without paying. */
export type DropFee = { kind: "paid"; amountKobo: number } | { kind: "free" | "pack" | "earned" | "gift" };

export interface DropReport {
  headline: string;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  recordedSalesKobo: number;
  estimatedRewardCostKobo: number;
  /** Free items with no cost entered, left out of the estimate. */
  freeItemsWithoutCost: number;
  feeKobo: number;
  feeLabel: string;
  /** (estimated reward cost + fee) ÷ customers; per new customer for new-customer drops. */
  costPerCustomerKobo: number | null;
  costPerLabel: "per customer" | "per new customer";
  /** Customers who paid something on top of their reward. */
  spentBeyondReward: number;
  /** Next-visit Tikkas redeemed. */
  cameBack: number;
}

/** The business's estimated cost of one redeemed reward. */
export function rewardCost(r: ReportClaim["reward"], billKobo = 0): { kobo: number; known: boolean } {
  switch (r.type) {
    case "percent_off":
      return { kobo: Math.round((billKobo * (r.value ?? 0)) / 100), known: true };
    case "naira_off":
      return { kobo: (r.value ?? 0) * 100, known: true };
    case "free_item":
      return r.costKobo != null ? { kobo: r.costKobo, known: true } : { kobo: 0, known: false };
    default:
      return { kobo: 0, known: true };
  }
}

const FEE_LABEL: Record<Exclude<DropFee["kind"], "paid">, string> = {
  free: "Free drop",
  pack: "Season pack",
  earned: "Free (the drop you earned)",
  gift: "Free (a drop from Tikka)",
};

export function dropReport(drop: { goal?: Goal; validWeekdays?: number[] | null }, claims: ReportClaim[], fee: DropFee): DropReport {
  const used = claims.filter((c) => c.kind === "drop" && c.redeemed);
  const customers = used.length;
  const newCustomers = used.filter((c) => c.customerStatus !== "returning").length;
  const sales = used.reduce((x, c) => x + (c.billKobo ?? 0), 0);
  let cost = 0;
  let unknown = 0;
  for (const c of used) {
    const r = rewardCost(c.reward, c.billKobo);
    cost += r.kobo;
    if (!r.known) unknown++;
  }
  const feeKobo = fee.kind === "paid" ? fee.amountKobo : 0;
  const perNew = drop.goal === "new_customers";
  const base = perNew ? newCustomers : customers;
  const recorded = `${naira(sales / 100)} recorded`;
  const headline =
    drop.goal === "bring_back"
      ? `${count(customers)} customer${customers === 1 ? "" : "s"} came back · ${recorded}`
      : drop.goal === "quiet_days"
        ? `${count(customers)} customer${customers === 1 ? "" : "s"} on ${drop.validWeekdays?.length ? validDaysLabel(drop.validWeekdays).replace(/^Valid | only$/g, "") : "your quiet days"} · ${recorded}`
        : `${count(newCustomers)} new customer${newCustomers === 1 ? "" : "s"} · ${recorded}`;
  return {
    headline,
    customers,
    newCustomers,
    returningCustomers: customers - newCustomers,
    recordedSalesKobo: sales,
    estimatedRewardCostKobo: cost,
    freeItemsWithoutCost: unknown,
    feeKobo,
    feeLabel: fee.kind === "paid" ? naira(fee.amountKobo / 100) : FEE_LABEL[fee.kind],
    costPerCustomerKobo: base > 0 ? Math.round((cost + feeKobo) / base) : null,
    costPerLabel: perNew ? "per new customer" : "per customer",
    spentBeyondReward: used.filter((c) => (c.billKobo ?? 0) > 0).length,
    cameBack: claims.filter((c) => c.kind === "bounce_back" && c.redeemed).length,
  };
}
