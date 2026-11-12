// What Tikka's WhatsApp messages say (PRD A3), from a queued message's kind and payload. Pure,
// so the wording is pinned by tests. Template messages also give their parameters in order, as
// Meta's approved templates take them (TECH_PLAN §5). No gambling words (rule 8); naira as ₦.

import { clockTime, count, shortDate } from "./format";
import { dailySummaryParams, dailySummaryText } from "./summary";
import { visitDayWords } from "./visit";

const TIER_WORD: Record<string, string> = { legendary: "Legendary", rare: "Rare", common: "Thank-you", thank_you: "Thank-you" };

export type Reply =
  | "sold_out"
  | "market_sold_out"
  | "blocked_new_only"
  | "blocked_period"
  | "expired"
  | "invalid"
  | "help"
  | "stopped"
  | "stopped_all"
  | "notify_live"
  | "notify_invalid";

export interface Composed {
  text: string;
  /** Template messages: the {{1}}, {{2}}… values, in order. */
  params?: string[];
}

type P = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The card itself: what they got, the code and how long it lasts, and the link to the card. */
function cardText(p: P, site: string): string {
  const tier = TIER_WORD[str(p.tier)] ?? "";
  return `🎟 You got a Tikka from ${str(p.business_name)}! ${str(p.reward)}${tier ? ` · ${tier}` : ""} · Code ${str(p.code)} · use by ${shortDate(str(p.expires_at))}. Show this at the counter: ${site}/t/${str(p.view_token)}`;
}

function replyText(p: P, site: string): string {
  const b = str(p.business_name) || "this business";
  const dropUrl = `${site}/d/${str(p.business_slug)}/${str(p.drop_slug)}`;
  switch (p.reply as Reply) {
    case "sold_out":
      return `All of ${b}'s Tikkas in this drop have been claimed. Get told when they drop again: ${site}/${str(p.business_slug)}`;
    case "market_sold_out":
      return `The marketplace's share of ${b}'s drop is gone. ${b}'s own link may still have some.`;
    case "blocked_new_only":
      return `This drop is for new customers. You're already on ${b}'s list, so watch out for their next drop.`;
    case "blocked_period":
      return `You had a Tikka from ${b} recently. Watch out for their next drop.`;
    case "expired":
      return p.business_slug ? `That code has expired. Open the Tikka page and tap Claim again: ${dropUrl}` : "That code has expired. Open the Tikka page and tap Claim again.";
    case "invalid":
      return "Tap Claim on the Tikka page again and send the message as it is.";
    case "stopped":
      return `You won't get Tikka messages about ${b} again.`;
    case "stopped_all":
      return "You won't get any more Tikka messages.";
    case "notify_live":
      return `${b}'s drop is open right now. Claim yours: ${dropUrl}`;
    case "notify_invalid":
      return "That code has expired. Tap Notify me on the page again.";
    case "help":
    default:
      return "Hi! To get a Tikka, open a Tikka link and tap Claim: WhatsApp opens with the message to send. Reply STOP to stop messages.";
  }
}

/**
 * `template` is the one take_outbound() chose, when there is one: the reminder on the planned
 * visit day goes as tikka_visit_reminder once Meta approves it, else as tikka_expiry_reminder.
 */
export function compose(kind: string, p: P, site: string, template?: string | null): Composed {
  switch (kind) {
    case "card":
      return { text: cardText(p, site) };
    case "resend":
      return { text: `Here's your Tikka from ${str(p.business_name)} again. ${cardText(p, site)}` };
    case "reply":
      return { text: replyText(p, site) };
    case "notify_confirm": {
      const b = str(p.business_name);
      const when = p.scope === "drop" && p.starts_at ? `${b}'s drop opens on ${shortDate(str(p.starts_at))}, ${clockTime(str(p.starts_at))}` : `${b} drops again`;
      return { text: `${p.already ? "You're already on the list." : "Done."} We'll message you when ${when}.` };
    }
    case "thanks": {
      const bb = p.bounce_back as P | null | undefined;
      const next = bb ? `Here's ${str(bb.reward)}, valid till ${shortDate(str(bb.expires_at))}: ${site}/t/${str(bb.view_token)}` : "";
      const review = `${site}/t/${str(p.view_token)}/review`;
      const b = str(p.business_name);
      const first = str(p.first_name);
      return { text: `Thanks for coming to ${b}, ${first}.${next ? ` ${next}` : ""} How was it? Tap to rate: ${review}`, params: [b, first, next, review] };
    }
    case "expiry_reminder": {
      const url = `${site}/t/${str(p.view_token)}`;
      const ends = shortDate(str(p.expires_at));
      const part = str(p.visit_part);
      if (part && template !== "tikka_expiry_reminder") {
        const when = visitDayWords(part);
        return {
          text: `See you ${when} at ${str(p.business_name)}! Your ${str(p.reward)} is ready and ends ${ends}. Show this at the counter: ${url}`,
          params: [when, str(p.business_name), str(p.reward), ends, url],
        };
      }
      return { text: `Your ${str(p.reward)} at ${str(p.business_name)} ends ${ends}. Show this at the counter: ${url}`, params: [str(p.reward), str(p.business_name), ends, url] };
    }
    case "drop_live": {
      const url = `${site}/d/${str(p.business_slug)}/${str(p.drop_slug)}`;
      const total = count(Number(p.total) || 0);
      const legendary = count(Number(p.legendary) || 0);
      return { text: `${str(p.business_name)}'s drop is live. ${total} Tikkas, ${legendary} legendary. Claim yours: ${url}`, params: [str(p.business_name), total, legendary, url] };
    }
    case "owner_daily": {
      const c = { newClaims: Number(p.new_claims) || 0, planningTomorrow: Number(p.planning_tomorrow) || 0, expiringSoon: Number(p.expiring_soon) || 0 };
      const link = `${site}/app/leads`;
      const nudge = str(p.nudge) || null;
      return { text: dailySummaryText(str(p.business_name), c, link, nudge), params: dailySummaryParams(str(p.business_name), c, link, nudge) };
    }
    default:
      return { text: str(p.text) || "A message from Tikka." };
  }
}
