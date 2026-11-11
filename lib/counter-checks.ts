// The WhatsApp check at the counter, as Tikka admin sees it (admin_counter_checks()). Every Tikka
// that was claimed by typing a number with the check on lands in one outcome. Pure, so it's tested.

export interface CounterCheckRow {
  businessId: string;
  businessName: string;
  /** Checked and matched on the first try. */
  passedFirst: number;
  /** Didn't match at least once, then matched (the right phone came back). */
  failedThenPassed: number;
  /** Didn't match, never passed, and expired: the measure of claiming with someone else's number. */
  cameNotRedeemed: number;
  /** Didn't match, never passed, still time left. */
  failedWaiting: number;
  /** Never checked, and expired. Kept apart: not coming in isn't cheating. */
  neverCame: number;
  /** Never checked, still time left. */
  notYet: number;
}

export type CounterCheckTotals = Omit<CounterCheckRow, "businessId" | "businessName"> & {
  /** Tikkas that reached the counter and finished one way or the other. */
  settled: number;
  /** Came but couldn't redeem, as a share of the Tikkas that came to the counter and settled (0–1). */
  cheatRate: number | null;
};

export function counterCheckFrom(j: Record<string, unknown>): CounterCheckRow {
  const n = (k: string) => Number(j[k] ?? 0) || 0;
  return {
    businessId: String(j.business_id ?? ""),
    businessName: String(j.business_name ?? ""),
    passedFirst: n("passed_first"),
    failedThenPassed: n("failed_then_passed"),
    cameNotRedeemed: n("came_not_redeemed"),
    failedWaiting: n("failed_waiting"),
    neverCame: n("never_came"),
    notYet: n("not_yet"),
  };
}

export function counterCheckTotals(rows: CounterCheckRow[]): CounterCheckTotals {
  const sum = (k: keyof Omit<CounterCheckRow, "businessId" | "businessName">) => rows.reduce((a, r) => a + r[k], 0);
  const t = {
    passedFirst: sum("passedFirst"),
    failedThenPassed: sum("failedThenPassed"),
    cameNotRedeemed: sum("cameNotRedeemed"),
    failedWaiting: sum("failedWaiting"),
    neverCame: sum("neverCame"),
    notYet: sum("notYet"),
  };
  const settled = t.passedFirst + t.failedThenPassed + t.cameNotRedeemed;
  return { ...t, settled, cheatRate: settled ? t.cameNotRedeemed / settled : null };
}
