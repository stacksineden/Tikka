// NEW DIRECTION, stage 3 (docs/OWNER_JOURNEYS.md journeys 2 and 3): what a booking costs. Pure, so
// the booking sheet shows the same total the server charges. The server always works it out again
// from the service; the browser never sends an amount (rule 11's spirit for customer payments).

import { depositOn, EVENT_DEPOSIT_PERCENT } from "./presets";
import type { ServiceItem } from "./types";
import { clampQty, countText } from "./units";

export interface BookingChoice {
  /** Which option (choices), when the service has options and they aren't people. */
  option?: number;
  /** People per option (perPerson services): the first is always 1. */
  people?: number[];
  /** Which extras, by index. */
  extras?: number[];
  /** The owner comes to the customer. */
  home?: boolean;
  /** Per hour or per item: how many. */
  qty?: number;
}

export interface DepositRule {
  mode: "off" | "percent" | "fixed";
  percent?: number;
  fixedKobo?: number;
  counts: boolean;
}

export interface BookingPrice {
  lines: { label: string; naira: number }[];
  totalNaira: number;
  depositNaira: number;
  /** What's left to pay on the day. */
  restNaira: number;
  minutes: number;
  /** "Long, add wash" for the owner's Today. */
  detail?: string;
  /** The deposit as shown: "30%" or "₦5,000". */
  depositLabel: string;
}

export const MAX_PEOPLE = 15;

export function priceBooking(service: ServiceItem, choice: BookingChoice, travelFee: number, deposit: DepositRule | undefined): BookingPrice {
  const lines: { label: string; naira: number }[] = [];
  const options = service.options ?? [];
  let minutes = service.minutes ?? 60;
  const detail: string[] = [];

  if (service.perPerson && options.length) {
    options.forEach((o, i) => {
      const n = i === 0 ? 1 : Math.max(0, Math.min(MAX_PEOPLE, Math.round(choice.people?.[i] ?? 0)));
      if (n) lines.push({ label: i === 0 ? o.label : `${o.label} × ${n}`, naira: o.price * n });
      if (i > 0 && n) detail.push(`${n} ${o.label.toLowerCase().replace(/^each /, "")}${n > 1 ? "s" : ""}`);
    });
    minutes = options.reduce((m, o, i) => m + o.minutes * (i === 0 ? 1 : Math.max(0, choice.people?.[i] ?? 0)), 0);
  } else if (options.length) {
    const o = options[Math.max(0, Math.min(options.length - 1, choice.option ?? 0))];
    lines.push({ label: options.length > 1 ? `${service.name}, ${o.label.toLowerCase()}` : service.name, naira: o.price });
    minutes = o.minutes;
    if (options.length > 1) detail.push(o.label);
  } else {
    lines.push({ label: service.name, naira: service.price ?? 0 });
  }

  // Per hour or per item: the line above is for one, times how many (price_choice() does the same).
  if (service.unit && !service.perPerson && !service.eventDay && lines.length) {
    const n = clampQty(service, choice.qty);
    const one = lines[0];
    lines[0] = { label: `${one.label} · ${countText(service, n)} × ₦${one.naira.toLocaleString("en-NG")}`, naira: one.naira * n };
    if (service.unit === "hour") minutes = 60 * n;
    else if (service.unitMinutes) minutes = service.unitMinutes * n;
    minutes = Math.min(minutes, 600);
    detail.push(countText(service, n));
  }

  const extras = service.extras ?? [];
  for (const i of new Set(choice.extras ?? [])) {
    const x = extras[i];
    if (!x) continue;
    lines.push({ label: x.name, naira: x.price });
    detail.push(x.name.toLowerCase());
  }
  if (choice.home && travelFee > 0) lines.push({ label: "Travel fee", naira: travelFee });

  const totalNaira = lines.reduce((n, l) => n + l.naira, 0);
  let depositNaira = 0;
  let depositLabel = "";
  if (service.eventDay) {
    depositNaira = depositOn(totalNaira, { mode: "percent", percent: EVENT_DEPOSIT_PERCENT });
    depositLabel = `${EVENT_DEPOSIT_PERCENT}%`;
  } else if (deposit && deposit.mode === "percent") {
    depositNaira = depositOn(totalNaira, { mode: "percent", percent: deposit.percent ?? 30 });
    depositLabel = `${deposit.percent ?? 30}%`;
  } else if (deposit && deposit.mode === "fixed") {
    depositNaira = depositOn(totalNaira, { mode: "fixed", amount: (deposit.fixedKobo ?? 0) / 100 });
    depositLabel = "₦" + depositNaira.toLocaleString("en-NG");
  }
  const counts = deposit?.counts ?? true;
  return {
    lines,
    totalNaira,
    depositNaira,
    restNaira: Math.max(0, counts || service.eventDay ? totalNaira - depositNaira : totalNaira),
    minutes: Math.max(15, minutes),
    detail: detail.length ? detail.join(", ") : undefined,
    depositLabel,
  };
}
