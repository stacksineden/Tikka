import "server-only";

// The client book's data. Owners only (rule 4: numbers reach owners, never staff). Worked out from
// bookings, sales and Tikkas each time; notes and birthdays are stored (real accounts: client_notes,
// docs/DB_MOVE.md step 5; the demo: in memory).

import { getBookings } from "./bookings-data";
import { buildClients, type Client, type ClientNote, type TikkaClaim } from "./clients";
import { getLeads, isDbId, memberBusinessId } from "./data";
import { createClient } from "./supabase/server";
import { getLedger } from "./ledger-data";
import type { SessionUser } from "./types";

const notes: Map<string, Record<string, ClientNote>> = ((globalThis as { __tikkaClientNotes?: Map<string, Record<string, ClientNote>> }).__tikkaClientNotes ??= new Map());

export async function getClients(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<Client[]> {
  if (user.role !== "owner") return [];
  const now = new Date();
  const [bookings, ledger, leads, realNotes] = await Promise.all([
    getBookings(user, new Date(now.getTime() - 400 * 86_400_000), new Date(now.getTime() + 200 * 86_400_000)),
    getLedger(user),
    getLeads(user).catch(() => []),
    isDbId(user.id) ? dbNotes(user) : Promise.resolve(null),
  ]);
  const claims: TikkaClaim[] = leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone, reward: l.reward, claimedAt: l.claimedAt, redeemedAt: l.redeemedAt, spentKobo: l.spent ? l.spent * 100 : undefined }));
  return buildClients({ bookings, sales: ledger.sales, claims, notes: realNotes ?? (notes.get(user.id) ?? {}), now });
}

async function realBusiness(user: Pick<SessionUser, "id" | "role">): Promise<string | null> {
  if (user.role !== "owner" || !isDbId(user.id)) return null;
  const id = await memberBusinessId({ ...user, businessOwnerId: undefined });
  return id && isDbId(id) ? id : null;
}

/** get_client_notes(): the owner's notes and birthdays, by number. */
async function dbNotes(user: Pick<SessionUser, "id" | "role">): Promise<Record<string, ClientNote>> {
  const biz = await realBusiness(user);
  if (!biz) return {};
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_client_notes", { p_business: biz });
  return error || !data ? {} : (data as Record<string, ClientNote>);
}

export async function getClient(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, key: string): Promise<{ client: Client; all: Client[] } | null> {
  const all = await getClients(user);
  const client = all.find((c) => c.key === key);
  return client ? { client, all } : null;
}

/** Notes and birthday ("MM-DD"). Real accounts keep them by the customer's number (save_client_note()). */
export async function saveClientNote(user: Pick<SessionUser, "id" | "role">, key: string, note: ClientNote): Promise<boolean> {
  if (user.role !== "owner") return false;
  if (isDbId(user.id)) {
    const biz = await realBusiness(user);
    if (!biz || !/^\+[1-9]\d{7,14}$/.test(key)) return false;
    const sb = await createClient();
    const { data, error } = await sb.rpc("save_client_note", { p_business: biz, p_phone: key, p_notes: note.notes ?? null, p_birthday: note.birthday ?? null });
    return !error && data === true;
  }
  const mine = notes.get(user.id) ?? {};
  mine[key] = {
    notes: note.notes?.trim().slice(0, 500) || undefined,
    birthday: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(note.birthday ?? "") ? note.birthday : undefined,
  };
  notes.set(user.id, mine);
  return true;
}

/** A walk-in got their number: their notes and birthday move to the customer with that number (unless that one has notes already). */
export async function moveClientNote(user: Pick<SessionUser, "id" | "role">, from: string, to: string): Promise<void> {
  if (user.role !== "owner" || isDbId(user.id) || from === to) return;
  const mine = notes.get(user.id);
  if (!mine?.[from]) return;
  if (!mine[to]?.notes && !mine[to]?.birthday) mine[to] = mine[from];
  delete mine[from];
}
