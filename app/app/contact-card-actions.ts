"use server";

import { revalidatePath } from "next/cache";
import { addContactCard, removeContactCard, saveContactCard, type ContactCardChoices } from "@/lib/contact-cards-data";
import { isContactStyle } from "@/lib/contact-cards";
import { getOwnerUser } from "@/lib/session";

// Business cards on the dashboard (docs/BUSINESS_CARDS.md). Owners only, checked again in
// lib/contact-cards-data.ts and in the database.

function refresh() {
  revalidatePath("/app/posters/cards");
}

/** "Make a card for someone on your team": makes it; the form then opens it to design. */
export async function addContactCardAction(_prev: { error?: string; id?: string } | undefined, form: FormData): Promise<{ error?: string; id?: string }> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can make business cards." };
  const name = String(form.get("name") ?? "");
  if (!name.trim()) return { error: "Add their name." };
  const r = await addContactCard(user, name, String(form.get("role") ?? ""));
  if (!r.ok) return { error: r.error };
  refresh();
  return { id: r.card.id };
}

export async function saveContactCardAction(cardId: string, choices: ContactCardChoices): Promise<{ error?: string }> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can change business cards." };
  const clean: ContactCardChoices = {
    style: isContactStyle(choices.style) ? choices.style : undefined,
    photoId: typeof choices.photoId === "string" && choices.photoId ? choices.photoId : undefined,
    personName: String(choices.personName ?? ""),
    personRole: String(choices.personRole ?? ""),
    rounded: choices.rounded === true,
    showPhone: choices.showPhone !== false,
    showInstagram: choices.showInstagram !== false,
    showPlace: choices.showPlace !== false,
  };
  const error = await saveContactCard(user, cardId, clean);
  if (error) return { error };
  refresh();
  revalidatePath(`/app/posters/cards/${cardId}`);
  return {};
}

export async function removeContactCardAction(cardId: string): Promise<{ error?: string }> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can remove business cards." };
  const error = await removeContactCard(user, cardId);
  if (error) return { error };
  refresh();
  return {};
}
