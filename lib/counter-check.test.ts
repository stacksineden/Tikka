import { describe, expect, it } from "vitest";
import { cardFrom, checkFrom, digitsFrom, leadFrom, type CardJson, type LeadRow } from "./claim-map";
import { counterCheckFrom, counterCheckTotals } from "./counter-checks";
import { leadVerified } from "./leads";
import { bounceBackFor, checkClaim, checkDigits, confirmClaim, COUNTER_TRIES_PER_DAY, type ClaimRecord } from "./redeem";

// The WhatsApp check at the counter (supabase/migrations/20261111120000_counter_check.sql and
// 20261117120000_counter_six_digits.sql apply the same rules under locks; supabase/tests/033 and 039
// test them there).

const now = new Date("2026-11-11T12:00:00+01:00");
const tomorrow = new Date("2026-11-12T09:00:00+01:00");

const typed: ClaimRecord = {
  token: "t1",
  dropId: "drop_nov",
  ownerId: "owner_a",
  claimedAt: "2026-11-10T10:00:00+01:00",
  card: { token: "t1", tier: "rare", reward: "Free wash and style", code: "MB-K7Q4P", serial: "0012", total: 200, claimer: "Ada", expiresAt: "2026-11-24T23:59:00+01:00" },
  counterCheck: { last6: "334821", number: "n-ada", checks: [] },
};

/** Applies one check and keeps the new state, as the demo store does. */
function step(c: ClaimRecord, digits: string, at = now) {
  const r = checkDigits(c, "owner_a", c.card.code, digits, at);
  return { result: r.result, claim: r.state ? { ...c, counterCheck: r.state } : c };
}

describe("the WhatsApp check at the counter", () => {
  it("shows on a typed-in Tikka, with 3 tries, and blocks confirming", () => {
    const r = checkClaim(typed, "owner_a", "MB-K7Q4P", now);
    expect(r).toMatchObject({ kind: "valid", whatsappCheck: { triesLeft: COUNTER_TRIES_PER_DAY } });
    expect(JSON.stringify(r)).not.toContain("334821");
    expect(confirmClaim(typed, "owner_a", "MB-K7Q4P", { actionConfirmed: false, by: "staff" }, now)).toEqual({
      ok: false,
      result: { kind: "needs_whatsapp_check", code: "MB-K7Q4P" },
    });
  });

  it("isn't there for WhatsApp claims", () => {
    const whatsapp: ClaimRecord = { ...typed, counterCheck: undefined };
    expect(checkClaim(whatsapp, "owner_a", "MB-K7Q4P", now)).not.toHaveProperty("whatsappCheck.triesLeft");
    expect(checkDigits(whatsapp, "owner_a", "MB-K7Q4P", "334821", now).result.kind).toBe("not_needed");
  });

  it("only takes 6 digits, and doesn't count a bad entry", () => {
    expect(checkDigits(typed, "owner_a", "MB-K7Q4P", "3348a1", now)).toEqual({ result: { kind: "invalid_digits", code: "MB-K7Q4P" } });
    expect(checkDigits(typed, "owner_a", "MB-K7Q4P", "4821", now).state).toBeUndefined();
    expect(checkDigits(typed, "owner_a", "MB-K7Q4P", "0334821", now).result.kind).toBe("invalid_digits");
  });

  it("closes for the day after 3 wrong tries, even for the right digits, and opens again tomorrow", () => {
    let s = step(typed, "000000");
    expect(s.result).toEqual({ kind: "no_match", code: "MB-K7Q4P", triesLeft: 2 });
    s = step(s.claim, "111111");
    expect(s.result).toMatchObject({ kind: "no_match", triesLeft: 1 });
    s = step(s.claim, "222222");
    expect(s.result.kind).toBe("closed_today");
    const closed = step(s.claim, "334821");
    expect(closed.result.kind).toBe("closed_today");
    expect(closed.claim.counterCheck!.checks).toHaveLength(3);
    expect(checkClaim(s.claim, "owner_a", "MB-K7Q4P", now)).toMatchObject({ whatsappCheck: { triesLeft: 0 } });

    expect(checkClaim(s.claim, "owner_a", "MB-K7Q4P", tomorrow)).toMatchObject({ whatsappCheck: { triesLeft: 3 } });
    const next = step(s.claim, "334821", tomorrow);
    expect(next.result.kind).toBe("matched");
    expect(next.claim.counterCheck!.checks.map((c) => c.matched)).toEqual([false, false, false, true]);
  });

  it("never stores the digits typed", () => {
    const s = step(typed, "999999");
    expect(JSON.stringify(s.claim.counterCheck!.checks)).not.toContain("999999");
  });

  it("unlocks confirming once it matches, and the next-visit Tikka isn't checked again", () => {
    const passed = step(typed, "334821").claim;
    expect(checkClaim(passed, "owner_a", "MB-K7Q4P", now)).not.toHaveProperty("whatsappCheck.triesLeft");
    const done = confirmClaim(passed, "owner_a", "MB-K7Q4P", { actionConfirmed: false, by: "staff" }, now);
    expect(done.ok).toBe(true);
    const bb = bounceBackFor(done.ok ? done.claim : passed, { reward: "₦1,000 off", validityDays: 30 }, [], { token: "bb", code: "MB-ACDE4" }, now)!;
    expect(checkClaim(bb, "owner_a", "MB-ACDE4", now)).not.toHaveProperty("whatsappCheck.triesLeft");
  });

  it("answers for the business's own Tikkas only", () => {
    expect(checkDigits(typed, "owner_b", "MB-K7Q4P", "334821", now).result.kind).toBe("wrong_business");
  });
});

describe("one used Tikka per WhatsApp per drop", () => {
  // Their WhatsApp ends …554521. They typed made-up numbers ending 554521 and 994521 (same last 4 only).
  const tikka = (token: string, last6: string, number: string, code: string): ClaimRecord => ({
    ...typed,
    token,
    card: { ...typed.card, token, code },
    counterCheck: { last6, number, checks: [] },
  });
  const fake6 = tikka("f6", "554521", "n-fake6", "MB-AAAA2");
  const fake4 = tikka("f4", "994521", "n-fake4", "MB-AAAA3");
  const real = tikka("r", "554521", "n-real", "MB-AAAA4");
  const honest = tikka("h", "114521", "n-honest", "MB-AAAA5");
  const used = (c: ClaimRecord): ClaimRecord => ({ ...c, redeemedAt: now.toISOString(), counterCheck: { ...c.counterCheck!, passedAt: now.toISOString() } });

  it("stops the real one after a fake was used, and the fake after the real one", () => {
    const afterFake = [used(fake6), fake4, real, honest];
    const r = checkDigits(real, "owner_a", real.card.code, "554521", now, afterFake);
    expect(r.result).toEqual({ kind: "used_by_this_whatsapp", code: real.card.code });
    expect(r.state!.checks).toEqual([{ at: now.toISOString(), matched: false, repeat: true }]);
    expect(r.state!.passedAt).toBeUndefined();
    expect(checkDigits(fake6, "owner_a", fake6.card.code, "554521", now, [used(real), fake6]).result.kind).toBe("used_by_this_whatsapp");
  });

  it("doesn't let a fake that only shares the last 4 through, and lets the honest look-alike through", () => {
    expect(checkDigits(fake4, "owner_a", fake4.card.code, "554521", now, [used(fake6)]).result.kind).toBe("no_match");
    expect(checkDigits(honest, "owner_a", honest.card.code, "114521", now, [used(fake6)]).result.kind).toBe("matched");
  });

  it("refuses the second at confirm when both passed before either was used", () => {
    const passed = (c: ClaimRecord) => ({ ...c, counterCheck: { ...c.counterCheck!, passedAt: now.toISOString() } });
    expect(confirmClaim(passed(fake6), "owner_a", fake6.card.code, { actionConfirmed: false, by: "s" }, now, [used(real)])).toEqual({
      ok: false,
      result: { kind: "used_by_this_whatsapp", code: fake6.card.code },
    });
    expect(confirmClaim(passed(real), "owner_a", real.card.code, { actionConfirmed: false, by: "s" }, now, [passed(fake6)]).ok).toBe(true);
  });

  it("never blocks the same number: their next-visit Tikka, or the same typed number", () => {
    const sameNumber = tikka("r2", "554521", "n-real", "MB-AAAA6");
    expect(checkDigits(sameNumber, "owner_a", sameNumber.card.code, "554521", now, [used(real)]).result.kind).toBe("matched");
  });

  it("only looks within the same drop", () => {
    const otherDrop = { ...used(fake6), dropId: "drop_dec" };
    expect(checkDigits(real, "owner_a", real.card.code, "554521", now, [otherDrop]).result.kind).toBe("matched");
  });
});

describe("the database's answers", () => {
  it("maps the check box on check_code", () => {
    const r = checkFrom({ kind: "valid", code: "MB-K7Q4P", name: "Ada", reward: "x", tier: "rare", expires_at: now.toISOString(), suggested_status: "new", whatsapp_check: { tries_left: 2 } });
    expect(r).toMatchObject({ whatsappCheck: { triesLeft: 2 } });
    expect(checkFrom({ kind: "valid", code: "MB-K7Q4P", name: "Ada", reward: "x", tier: "rare", expires_at: now.toISOString() })).toMatchObject({ whatsappCheck: undefined });
  });

  it("maps check_whatsapp_digits", () => {
    expect(digitsFrom({ kind: "matched", code: "MB-K7Q4P" }, "x")).toEqual({ kind: "matched", code: "MB-K7Q4P" });
    expect(digitsFrom({ kind: "no_match", code: "MB-K7Q4P", tries_left: 1 }, "x")).toEqual({ kind: "no_match", code: "MB-K7Q4P", triesLeft: 1 });
    expect(digitsFrom({ kind: "closed_today" }, "MB-K7Q4P")).toEqual({ kind: "closed_today", code: "MB-K7Q4P" });
    expect(digitsFrom({ kind: "used_by_this_whatsapp", code: "MB-K7Q4P" }, "x")).toEqual({ kind: "used_by_this_whatsapp", code: "MB-K7Q4P" });
    expect(digitsFrom({ kind: "expired", code: "MB-K7Q4P", at: now.toISOString() }, "x").kind).toBe("expired");
  });

  it("tells the card to say 'bring the phone' and the owner which leads are Verified", () => {
    const j = { view_token: "v", kind: "drop", drop_id: "d", tier: "rare", reward: "x", action: null, code: "MB-K7Q4P", serial: 1, total: 10, first_name: "Ada",
      expires_at: now.toISOString(), redeemed_at: null, planned_visit_date: null, planned_visit_part: null, valid_weekdays: null, phone_confirmed: false, counter_check: true } as CardJson;
    expect(cardFrom(j).counterCheck).toBe(true);
    expect(cardFrom({ ...j, counter_check: false }).counterCheck).toBeUndefined();

    const row = { claim_id: "c", lead_id: "l", drop_id: "d", first_name: "Ada", profile_name: null, phone: "+2348031234821", source: "direct", is_new_lead: true,
      claimed_at: now.toISOString(), expires_at: now.toISOString(), redeemed_at: null, bill_amount_kobo: null, planned_visit_date: null, planned_visit_part: null,
      tier: "rare", reward: "x", marketing_opt_in: false, last_followup_at: null } as LeadRow;
    expect(leadVerified(leadFrom({ ...row, phone_confirmed: true }))).toBe(true);
    expect(leadVerified(leadFrom({ ...row, phone_confirmed: false, counter_checked: false }))).toBe(false);
    expect(leadVerified(leadFrom({ ...row, phone_confirmed: false, counter_checked: true }))).toBe(true);
  });
});

describe("Tikka admin's numbers", () => {
  it("adds up the outcomes and the share that came but couldn't redeem", () => {
    const rows = [
      counterCheckFrom({ business_id: "a", business_name: "A", passed_first: 6, failed_then_passed: 1, came_not_redeemed: 1, never_came: 4, not_yet: 2 }),
      counterCheckFrom({ business_id: "b", business_name: "B", passed_first: 2, failed_waiting: 1, used_by_this_whatsapp: 2 }),
    ];
    const t = counterCheckTotals(rows);
    expect(t.usedByThisWhatsapp).toBe(2);
    expect(t).toMatchObject({ passedFirst: 8, failedThenPassed: 1, cameNotRedeemed: 1, failedWaiting: 1, neverCame: 4, notYet: 2, settled: 10 });
    expect(t.cheatRate).toBeCloseTo(0.1);
    expect(counterCheckTotals([]).cheatRate).toBeNull();
  });
});
