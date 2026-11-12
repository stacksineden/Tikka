// One claimer's card from the database (private.card_json) as the claim page and the card page
// show it. Pure, so the mapping is pinned by tests. Never carries a phone number.

import { serialLabel } from "./claim";
import { reviewState, type CheckResult, type DigitsResult } from "./redeem";
import type { CardStatus, ClaimedCard, Lead, Source, Tier } from "./types";
import { validDaysLabel, VISIT_PARTS, visitOptions, type VisitPart } from "./visit";

export interface CardJson {
  view_token: string;
  kind: "drop" | "bounce_back";
  drop_id: string;
  tier: "legendary" | "rare" | "common";
  reward: string;
  action: string | null;
  code: string;
  serial: number | null;
  total: number;
  first_name: string;
  expires_at: string;
  redeemed_at: string | null;
  planned_visit_date: string | null;
  planned_visit_part: CardStatus["plannedVisitPart"] | null;
  valid_weekdays: number[] | null;
  /** False for a page claim with a typed number (lib/claim-mode.ts). */
  phone_confirmed?: boolean;
  /** Typed in with the counter check on, not checked yet. */
  counter_check?: boolean;
}

const TIER: Record<CardJson["tier"], Tier> = { legendary: "legendary", rare: "rare", common: "thank_you" };

export function cardFrom(j: CardJson): ClaimedCard {
  return {
    token: j.view_token,
    kind: j.kind,
    tier: TIER[j.tier],
    reward: j.reward,
    instruction: j.action ? `${j.action} and show it at the counter` : undefined,
    action: j.action ?? undefined,
    code: j.code,
    serial: j.serial === null ? "" : serialLabel(j.serial, j.total),
    total: j.total,
    claimer: j.first_name,
    expiresAt: new Date(j.expires_at).toISOString(),
    confirmed: j.phone_confirmed !== false,
    counterCheck: j.counter_check === true ? true : undefined,
  };
}

export function statusFrom(j: CardJson, now: Date): CardStatus {
  const redeemedAt = j.redeemed_at ? new Date(j.redeemed_at).toISOString() : undefined;
  const expired = !redeemedAt && Date.parse(j.expires_at) <= now.getTime();
  const canPlan = !redeemedAt && !expired && j.kind === "drop";
  return {
    redeemedAt,
    expired,
    review: reviewState({ redeemedAt }, now),
    plannedVisitDate: j.planned_visit_date ?? undefined,
    plannedVisitPart: j.planned_visit_part ?? undefined,
    visitOptions: canPlan ? visitOptions(now, new Date(j.expires_at).toISOString(), j.valid_weekdays) : undefined,
  };
}

/** "Claim my Tikka TK-4821K from Glow Studio", to Tikka's WhatsApp number (any chat until it's set). */
export function claimMessageUrl(token: string, businessName: string, number: string | undefined): string {
  const text = encodeURIComponent(`Claim my Tikka ${token} from ${businessName}`);
  const digits = (number ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

/* ---------------------------------------------------------------- the counter */

/** check_code()'s answer as the counter screen shows it (lib/redeem.ts CheckResult). Never a phone number. */
export function checkFrom(j: Record<string, unknown>): CheckResult {
  const code = String(j.code ?? "");
  switch (j.kind) {
    case "valid":
      return {
        kind: "valid",
        code,
        name: String(j.name ?? ""),
        reward: String(j.reward ?? ""),
        tier: TIER[(j.tier as CardJson["tier"]) ?? "common"] ?? "thank_you",
        expiresAt: new Date(String(j.expires_at)).toISOString(),
        action: typeof j.action === "string" ? j.action : undefined,
        suggestedStatus: j.suggested_status === "returning" ? "returning" : "new",
        whatsappCheck: j.whatsapp_check && typeof j.whatsapp_check === "object"
          ? { triesLeft: Number((j.whatsapp_check as { tries_left?: unknown }).tries_left ?? 0) }
          : undefined,
        plannedVisitDate: typeof j.planned_visit_date === "string" ? j.planned_visit_date : undefined,
        plannedVisitPart: VISIT_PARTS.some((p) => p.id === j.planned_visit_part) ? (j.planned_visit_part as VisitPart) : undefined,
      };
    case "already_used":
      return { kind: "already_used", code, at: new Date(String(j.at)).toISOString() };
    case "expired":
      return { kind: "expired", code, at: new Date(String(j.at)).toISOString() };
    case "wrong_day":
      return { kind: "wrong_day", code, days: validDaysLabel((j.days as number[]) ?? []) };
    case "wrong_business":
      return { kind: "wrong_business", code };
    default:
      return { kind: "unknown", code };
  }
}

/* ------------------------------------------------------------------ leads */

export interface LeadRow {
  claim_id: string;
  drop_id: string;
  first_name: string;
  profile_name: string | null;
  phone: string;
  source: string;
  is_new_lead: boolean;
  claimed_at: string;
  expires_at: string;
  redeemed_at: string | null;
  bill_amount_kobo: number | null;
  planned_visit_date: string | null;
  planned_visit_part: Lead["plannedVisitPart"] | null;
  tier: CardJson["tier"];
  reward: string;
  marketing_opt_in: boolean;
  last_followup_at: string | null;
  phone_confirmed?: boolean;
  counter_checked?: boolean;
}

const SOURCES: Source[] = ["wa", "ig", "qr", "web", "ads", "market", "direct"];

/** One row of get_leads() as the Leads page shows it: the owner sees the full name and number (rule 4). */
export function leadFrom(r: LeadRow): Lead {
  const iso = (v: string | null) => (v ? new Date(v).toISOString() : undefined);
  return {
    id: r.claim_id,
    name: r.profile_name?.trim() || r.first_name,
    phone: r.phone,
    status: r.redeemed_at ? "redeemed" : "claimed",
    isNew: r.is_new_lead,
    fromMarketplace: r.source === "market",
    source: SOURCES.includes(r.source as Source) ? (r.source as Source) : "direct",
    tier: TIER[r.tier] ?? "thank_you",
    reward: r.reward,
    dropId: r.drop_id,
    claimedAt: new Date(r.claimed_at).toISOString(),
    spent: r.bill_amount_kobo ? r.bill_amount_kobo / 100 : undefined,
    lastFollowupAt: iso(r.last_followup_at),
    marketingOptIn: r.marketing_opt_in,
    expiresAt: new Date(r.expires_at).toISOString(),
    plannedVisitDate: r.planned_visit_date ?? undefined,
    plannedVisitPart: r.planned_visit_part ?? undefined,
    phoneConfirmed: r.phone_confirmed !== false,
    counterChecked: r.counter_checked === true,
  };
}

/** The database's answer to the 4-digit check, as the counter screen reads it. */
export function digitsFrom(j: Record<string, unknown>, fallbackCode: string): CheckResult | DigitsResult {
  const code = String(j.code ?? fallbackCode);
  switch (j.kind) {
    case "matched":
    case "closed_today":
    case "not_needed":
    case "invalid_digits":
      return { kind: j.kind, code };
    case "no_match":
      return { kind: "no_match", code, triesLeft: Number(j.tries_left ?? 0) };
    default:
      return checkFrom(j);
  }
}
