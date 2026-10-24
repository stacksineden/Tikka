import "server-only";

import { cardFrom, statusFrom, type CardJson } from "./claim-map";
import { dropFrom, type DropRow } from "./drop-map";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { CardStatus, ClaimedCard, Drop, EventKind, Source } from "./types";

// The claim page for drops in Supabase. The drop and its rewards are public; claim codes, link
// activity and cards go through the server's functions (the browser never calls them directly).

const PUBLIC_COLUMNS =
  "id, slug, title, goal, template_id, total_cards, finish, starts_at, ends_at, validity_days, valid_weekdays, bounce_back, ignored_warnings, status, published_at, show_in_marketplace, tier_id, tier_max_cards, paid_with, payment_status, eligibility, rewards(tier, kind, value, title, action_text, terms, quantity, min_spend_kobo, requires_purchase)";

/** A published drop of this business, with how many have been claimed. */
export async function dbPublicDrop(businessId: string, dropSlug: string, now: Date): Promise<{ drop: Drop; newOnly: boolean } | null> {
  const sb = await createClient();
  const { data: row } = await sb
    .from("drops")
    .select(PUBLIC_COLUMNS)
    .eq("business_id", businessId)
    .eq("slug", dropSlug)
    .in("status", ["published", "ended_early"])
    .maybeSingle<Omit<DropRow, "builder"> & { eligibility: string }>();
  if (!row) return null;
  const { data: claimed } = await sb.rpc("drop_claimed_count", { p_drop: row.id });
  return { drop: dropFrom({ ...row, builder: null }, { claimed: (claimed as number) ?? 0, redeemed: 0, revenue: 0 }, now), newOnly: row.eligibility === "new_only" };
}

export async function dbDropExists(dropId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(dropId)) return false;
  const { count } = await adminClient().from("drops").select("id", { count: "exact", head: true }).eq("id", dropId).in("status", ["published", "ended_early"]);
  return (count ?? 0) > 0;
}

/** Link activity; the visitor id arrives already hashed with a daily salt. */
export async function dbRecordEvent(dropId: string, kind: EventKind, source: Source, visitorHash: string, posterId?: string): Promise<void> {
  await adminClient().rpc("record_drop_event", { p_drop: dropId, p_type: kind, p_source: source, p_visitor_hash: visitorHash, p_poster: posterId ?? null });
}

export type IntentResult = { kind: "intent"; token: string; expiresAt: string } | { kind: "scheduled" | "ended" | "sold_out" | "not_found" };

export async function dbCreateIntent(dropId: string, name: string, futureDrops: boolean, visitorId: string, source: Source, posterId?: string): Promise<IntentResult> {
  const { data, error } = await adminClient().rpc("create_claim_intent", {
    p_drop: dropId,
    p_first_name: name,
    p_future_drops: futureDrops,
    p_visitor_id: visitorId,
    p_source: source,
    p_poster: posterId ?? null,
  });
  if (error) return { kind: "not_found" };
  const r = data as { kind: string; token?: string; expires_at?: string };
  return r.kind === "intent" ? { kind: "intent", token: r.token!, expiresAt: r.expires_at! } : { kind: r.kind as "scheduled" | "ended" | "sold_out" | "not_found" };
}

export type ClaimPoll =
  | { kind: "ready"; card: ClaimedCard; status: CardStatus; dropId: string }
  | { kind: "pending" | "sold_out" | "market_sold_out" | "blocked_new_only" | "blocked_period" | "expired" | "invalid" };

/** The waiting page's question: has WhatsApp confirmed it yet? The card only for the visitor who asked. */
export async function dbClaimResult(token: string, visitorId: string): Promise<ClaimPoll> {
  const { data, error } = await adminClient().rpc("claim_result", { p_token: token, p_visitor_id: visitorId });
  if (error || !data) return { kind: "invalid" };
  const r = data as { kind: string; card?: CardJson };
  if ((r.kind === "claimed" || r.kind === "duplicate") && r.card) return { kind: "ready", card: cardFrom(r.card), status: statusFrom(r.card, new Date()), dropId: r.card.drop_id };
  return { kind: r.kind as Exclude<ClaimPoll["kind"], "ready"> };
}

/** A card by its private link (the claim cookie, or the link in WhatsApp). */
export async function dbCardByViewToken(viewToken: string): Promise<{ card: ClaimedCard; status: CardStatus; dropId: string } | null> {
  const { data } = await adminClient().rpc("claim_by_view_token", { p_view_token: viewToken });
  const j = data as CardJson | null;
  return j ? { card: cardFrom(j), status: statusFrom(j, new Date()), dropId: j.drop_id } : null;
}

/** Marks a card opened; true the first time (the card link then plays the hold-and-flip). */
export async function dbRevealCard(viewToken: string): Promise<boolean> {
  const { data } = await adminClient().rpc("reveal_card", { p_view_token: viewToken });
  return data === true;
}

/** The business and drop a card belongs to, for the card page. */
export async function dbCardOwner(viewToken: string): Promise<{ businessSlug: string; dropSlug: string } | null> {
  const { data } = await adminClient().rpc("claim_by_view_token", { p_view_token: viewToken });
  const j = data as { business_slug?: string; drop_slug?: string } | null;
  return j?.business_slug && j.drop_slug ? { businessSlug: j.business_slug, dropSlug: j.drop_slug } : null;
}
