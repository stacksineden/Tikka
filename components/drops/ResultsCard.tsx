import { count, naira } from "@/lib/format";
import type { DropReport } from "@/lib/report";

const money = (kobo: number) => naira(kobo / 100);

/** The drop report's results (PRD B6): sales are "recorded", reward costs "estimated". */
export function ResultsCard({ report: r }: { report: DropReport }) {
  const rows: [string, string, string?][] = [
    ["Customers who came in", count(r.customers), r.customers ? `${count(r.newCustomers)} new · ${count(r.returningCustomers)} been before` : undefined],
    ["Recorded sales", money(r.recordedSalesKobo), "What staff typed at the counter"],
    [
      "Estimated reward cost",
      money(r.estimatedRewardCostKobo),
      r.freeItemsWithoutCost ? `${count(r.freeItemsWithoutCost)} free item${r.freeItemsWithoutCost === 1 ? "" : "s"} not counted` : undefined,
    ],
    ["Tikka fee", r.feeLabel],
    ["Cost " + r.costPerLabel, r.costPerCustomerKobo === null ? "—" : money(r.costPerCustomerKobo), "Reward cost and Tikka fee, shared out"],
    ["Spent beyond the reward", count(r.spentBeyondReward)],
    ["Came back", count(r.cameBack), "Next-visit Tikkas used"],
  ];
  return (
    <section className="min-w-0 rounded-card border border-gold/40 bg-gold-soft p-4 sm:p-6" aria-labelledby="results-h">
      <h2 id="results-h" className="text-caption font-semibold uppercase tracking-[0.06em] text-gold-text">
        Results
      </h2>
      <p className="text-heading mt-1">{r.headline}</p>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-md bg-line sm:grid-cols-2">
        {rows.map(([k, v, note]) => (
          <div key={k} className="bg-surface-raised p-3">
            <dt className="text-caption text-ink-muted">{k}</dt>
            <dd className="text-title tabular-nums">{v}</dd>
            {note && <dd className="text-caption text-ink-muted">{note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
