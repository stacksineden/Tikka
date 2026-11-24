import "server-only";

import { ownedBusinessId } from "./business-db";
import { isContactStyle, type ContactCard } from "./contact-cards";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Business cards for businesses in Supabase (supabase/migrations/20261202100000_contact_cards.sql).
// Owners only: the database checks who may read and change them, not this file.

type Row = Record<string, unknown>;

function cardFrom(r: Row, businessId: string): ContactCard {
  return {
    id: String(r.id),
    businessId,
    code: String(r.code).trim(),
    style: isContactStyle(r.style) ? r.style : undefined,
    photoId: (r.photo_id as string | null) ?? undefined,
    personName: (r.person_name as string | null) ?? undefined,
    personRole: (r.person_role as string | null) ?? undefined,
    rounded: r.rounded === true,
    showPhone: r.show_phone !== false,
    showInstagram: r.show_instagram !== false,
    showPlace: r.show_place !== false,
    createdAt: String(r.created_at),
    scansMonth: Number(r.scans_month ?? 0),
    scansTotal: Number(r.scans_total ?? 0),
  };
}

export async function dbContactCards(ownerId: string): Promise<ContactCard[]> {
  const sb = await createClient();
  const id = await ownedBusinessId(sb, ownerId);
  if (!id) return [];
  const { data, error } = await sb.rpc("my_contact_cards", { p_business: id });
  if (error) return [];
  return ((data as Row[] | null) ?? []).map((r) => cardFrom(r, id));
}

export async function dbAddContactCard(ownerId: string, personName?: string, personRole?: string): Promise<ContactCard | string> {
  const sb = await createClient();
  const id = await ownedBusinessId(sb, ownerId);
  if (!id) return "Only the owner can make business cards.";
  const { data, error } = await sb.rpc("add_contact_card", { p_business: id, p_person_name: personName ?? null, p_person_role: personRole ?? null });
  if (error) return error.code === "23514" ? "You can have up to 20 business cards." : "We couldn't make the card. Try again.";
  return cardFrom(data as Row, id);
}

export async function dbSaveContactCard(card: ContactCard): Promise<string | null> {
  const sb = await createClient();
  const { error } = await sb.rpc("save_contact_card", {
    p_card: card.id,
    p_style: card.style ?? null,
    p_photo: card.photoId ?? null,
    p_person_name: card.personName ?? null,
    p_person_role: card.personRole ?? null,
    p_rounded: card.rounded,
    p_show_phone: card.showPhone,
    p_show_instagram: card.showInstagram,
    p_show_place: card.showPlace,
  });
  if (!error) return null;
  return error.code === "23514" ? "Pick one of your own photos, and keep the name and role short." : "We couldn't save the card. Try again.";
}

export async function dbRemoveContactCard(cardId: string): Promise<string | null> {
  const sb = await createClient();
  const { error } = await sb.rpc("remove_contact_card", { p_card: cardId });
  return error ? "We couldn't remove the card. Try again." : null;
}

/** /c/[code]: the business page's slug, counting the scan once per visitor per day. Server only. */
export async function dbContactCardScan(code: string, visitorHash: string): Promise<string | null> {
  const { data } = await adminClient().rpc("contact_card_scan", { p_code: code, p_visitor_hash: visitorHash });
  const row = (data as { slug: string }[] | null)?.[0];
  return row?.slug ?? null;
}
