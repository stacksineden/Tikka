import { describe, expect, it } from "vitest";
import { seededRng } from "./deck";
import { alertRecipients, notifyCode, routeInbound, type Subscription } from "./notify";

describe("notify me", () => {
  it("makes NT- codes", () => {
    expect(notifyCode(seededRng(1))).toMatch(/^NT-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/);
  });

  it("routes what people send Tikka", () => {
    expect(routeInbound("Notify me about Glow Studio NT-7KQ4A")).toEqual({ kind: "notify", code: "NT-7KQ4A" });
    expect(routeInbound("Claim my Tikka from Glow Studio TK-9XQ2")).toEqual({ kind: "claim", code: "TK-9XQ2" });
    expect(routeInbound("stop")).toEqual({ kind: "stop", all: false });
    expect(routeInbound("STOP ALL")).toEqual({ kind: "stop", all: true });
    expect(routeInbound("hello")).toEqual({ kind: "other" });
  });

  it("alerts each number once, skips STOP, caps, and uses up drop subscriptions", () => {
    const subs: Subscription[] = [
      { id: "s1", phone: "+2348030000001", businessId: "b1", dropId: "d1" },
      { id: "s2", phone: "+2348030000001", businessId: "b1" },
      { id: "s3", phone: "+2348030000002", businessId: "b1" },
      { id: "s4", phone: "+2348030000003", businessId: "b1", dropId: "d1" },
      { id: "s5", phone: "+2348030000004", businessId: "b1", dropId: "d2" },
      { id: "s6", phone: "+2348030000005", businessId: "b2" },
      { id: "s7", phone: "+2348030000006", businessId: "b1", dropId: "d1", usedAt: "x" },
    ];
    const r = alertRecipients(subs, [{ phone: "+2348030000003", businessId: "b1" }], { id: "d1", businessId: "b1" });
    expect(r.send.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(r.useUp).toEqual(["s1"]);
    expect(alertRecipients(subs, [{ phone: "+2348030000001" }], { id: "d1", businessId: "b1" }).send.map((s) => s.id)).toEqual(["s3", "s4"]);
    expect(alertRecipients(subs, [], { id: "d1", businessId: "b1" }, 1).send).toHaveLength(1);
  });
});

describe("past claimers (rule 12)", () => {
  it("only get the alert when they ticked the future-drops box, and never after STOP", () => {
    const past = [
      { phone: "+2348030000101", businessId: "b1", marketingOptIn: true },
      { phone: "+2348030000102", businessId: "b1", marketingOptIn: false },
      { phone: "+2348030000103", businessId: "b1", marketingOptIn: true },
      { phone: "+2348030000104", businessId: "b2", marketingOptIn: true },
    ];
    const r = alertRecipients([], [{ phone: "+2348030000103", businessId: "b1" }], { id: "d1", businessId: "b1" }, 1000, past);
    expect(r.claimers).toEqual(["+2348030000101"]);
  });

  it("aren't sent twice when they also follow the business", () => {
    const subs: Subscription[] = [{ id: "s1", phone: "+2348030000101", businessId: "b1" }];
    const r = alertRecipients(subs, [], { id: "d1", businessId: "b1" }, 1000, [{ phone: "+2348030000101", businessId: "b1", marketingOptIn: true }]);
    expect(r.send).toHaveLength(1);
    expect(r.claimers).toEqual([]);
  });
});
