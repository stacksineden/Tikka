import "server-only";

import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import {
  contactTarget,
  isContactStyle,
  MAX_CONTACT_CARDS,
  newContactCard,
  newContactCode,
  photoChoices,
  validatePerson,
  type ContactCard,
  type ContactCardStyle,
} from "./contact-cards";
import { dbAddContactCard, dbContactCards, dbContactCardScan, dbRemoveContactCard, dbSaveContactCard } from "./contact-cards-db";
import { getBusiness, isDbId, visitorHash } from "./data";
import type { Business, SessionUser } from "./types";

// Business cards (docs/BUSINESS_CARDS.md). Pages only call this file. Real accounts read Supabase
// (lib/contact-cards-db.ts); the demo business keeps its cards in the DEMO STORE below, with the
// same rules as the database: owners only, the photo must be their own, up to 20, and a removed
// card's code keeps opening the page.

type User = Pick<SessionUser, "id" | "role">;
type DemoCard = ContactCard & { removedAt?: string };

const store: Map<string, DemoCard[]> = ((globalThis as { __tikkaContactCards?: Map<string, DemoCard[]> }).__tikkaContactCards ??= new Map());
/** Once per visitor per card per day, as contact_card_scan() does. */
const scannedBy: Set<string> = ((globalThis as { __tikkaContactScans?: Set<string> }).__tikkaContactScans ??= new Set());
const scanDays: Map<string, Map<string, number>> = ((globalThis as { __tikkaContactScanDays?: Map<string, Map<string, number>> }).__tikkaContactScanDays ??= new Map());

const watDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function withScans(c: DemoCard, now: Date): ContactCard {
  const days = scanDays.get(c.id) ?? new Map<string, number>();
  const month = watDay(now).slice(0, 7);
  let scansMonth = 0;
  let scansTotal = 0;
  for (const [day, n] of days) {
    scansTotal += n;
    if (day.startsWith(month)) scansMonth += n;
  }
  const card: DemoCard = { ...c, scansMonth, scansTotal };
  delete card.removedAt;
  return card;
}

function demoCode(): string {
  const taken = new Set([...store.values()].flat().map((c) => c.code));
  let code = newContactCode();
  while (taken.has(code)) code = newContactCode();
  return code;
}

function demoAdd(ownerId: string, person?: { name?: string; role?: string }): DemoCard {
  const card: DemoCard = { ...newContactCard(ownerId, demoCode(), new Date(), person), id: `cc_${randomBytes(6).toString("hex")}` };
  store.set(ownerId, [...(store.get(ownerId) ?? []), card]);
  return card;
}

const live = (list: DemoCard[] | undefined) => (list ?? []).filter((c) => !c.removedAt);

/**
 * Cards & posters › Business cards. Owners only. The business's own card is made the first time
 * they open the tab, so most owners just tap Print.
 */
export async function getContactCards(user: User): Promise<ContactCard[]> {
  if (user.role !== "owner") return [];
  await connection(); // scans and the DEMO store change at runtime: always read them fresh
  if (isDbId(user.id)) {
    const cards = await dbContactCards(user.id);
    if (cards.length > 0) return cards;
    const first = await dbAddContactCard(user.id);
    return typeof first === "string" ? [] : [first];
  }
  if (live(store.get(user.id)).length === 0) demoAdd(user.id);
  const now = new Date();
  return live(store.get(user.id)).map((c) => withScans(c, now));
}

/** One card with its business, for the editor and the print kit. Owners only. */
export async function getContactCard(user: User, cardId: string): Promise<{ business: Business; card: ContactCard } | null> {
  if (user.role !== "owner") return null;
  const [business, cards] = await Promise.all([getBusiness(user), getContactCards(user)]);
  const card = cards.find((c) => c.id === cardId);
  return business && card ? { business, card } : null;
}

export async function addContactCard(user: User, name: string, role: string): Promise<{ ok: true; card: ContactCard } | { ok: false; error: string }> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can make business cards." };
  const problem = validatePerson(name, role);
  if (problem) return { ok: false, error: problem };
  const person = { name: name.trim() || undefined, role: role.trim() || undefined };
  if (isDbId(user.id)) {
    const card = await dbAddContactCard(user.id, person.name, person.role);
    return typeof card === "string" ? { ok: false, error: card } : { ok: true, card };
  }
  if (live(store.get(user.id)).length >= MAX_CONTACT_CARDS) return { ok: false, error: `You can have up to ${MAX_CONTACT_CARDS} business cards.` };
  return { ok: true, card: withScans(demoAdd(user.id, person), new Date()) };
}

export interface ContactCardChoices {
  style?: ContactCardStyle;
  photoId?: string;
  personName: string;
  personRole: string;
  rounded: boolean;
  showPhone: boolean;
  showInstagram: boolean;
  showPlace: boolean;
}

/** Everything the owner picks. Returns the problem, or null when saved. */
export async function saveContactCard(user: User, cardId: string, choices: ContactCardChoices): Promise<string | null> {
  if (user.role !== "owner") return "Only the owner can change business cards.";
  if (choices.style !== undefined && !isContactStyle(choices.style)) return "Pick a card style.";
  const problem = validatePerson(choices.personName, choices.personRole);
  if (problem) return problem;
  const found = await getContactCard(user, cardId);
  if (!found) return "That card isn't there any more.";
  if (choices.photoId && !photoChoices(found.business).some((p) => p.id === choices.photoId)) return "Pick one of your own photos.";
  const name = choices.personName.trim() || undefined;
  const next: ContactCard = {
    ...found.card,
    style: choices.style,
    photoId: choices.photoId || undefined,
    personName: name,
    personRole: name ? choices.personRole.trim() || undefined : undefined,
    rounded: choices.rounded,
    showPhone: choices.showPhone,
    showInstagram: choices.showInstagram,
    showPlace: choices.showPlace,
  };
  if (isDbId(user.id)) return dbSaveContactCard(next);
  store.set(user.id, (store.get(user.id) ?? []).map((c) => (c.id === cardId ? { ...c, ...next } : c)));
  return null;
}

/** Hides the card. Its code keeps opening the business page, because it may be printed already. */
export async function removeContactCard(user: User, cardId: string): Promise<string | null> {
  if (user.role !== "owner") return "Only the owner can remove business cards.";
  if (isDbId(user.id)) return dbRemoveContactCard(cardId);
  const list = store.get(user.id) ?? [];
  if (!live(list).some((c) => c.id === cardId)) return "That card isn't there any more.";
  store.set(user.id, list.map((c) => (c.id === cardId ? { ...c, removedAt: new Date().toISOString() } : c)));
  return null;
}

/** A scan of usetikka.com/c/[code]: counts it and says where to send them (the business page). Public. */
export async function scanContactCard(code: string, visitorId: string | undefined): Promise<string | null> {
  await connection();
  const now = new Date();
  const hash = visitorId ? visitorHash(visitorId, now) : "";
  for (const [ownerId, list] of store) {
    const card = list.find((c) => c.code === code);
    if (!card) continue;
    const b = await getBusiness({ id: ownerId });
    if (!b) return null;
    const key = `${card.id}:${hash}`;
    if (hash && !scannedBy.has(key)) {
      scannedBy.add(key);
      const days = scanDays.get(card.id) ?? new Map<string, number>();
      days.set(watDay(now), (days.get(watDay(now)) ?? 0) + 1);
      scanDays.set(card.id, days);
    }
    return contactTarget(b.slug);
  }
  const slug = await dbContactCardScan(code, hash);
  return slug ? contactTarget(slug) : null;
}
