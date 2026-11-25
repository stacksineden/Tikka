import "server-only";

// NEW DIRECTION: the client book's data. Owners only (rule 4: numbers reach owners, never staff).
// Demo store only for now; real accounts get the client book once it has tables.

import { getBookings } from "./bookings-data";
import { buildClients, type Client, type ClientNote, type TikkaClaim } from "./clients";
import { getLeads, isDbId } from "./data";
import { getLedger } from "./ledger-data";
import type { SessionUser } from "./types";

const notes: Map<string, Record<string, ClientNote>> = ((globalThis as { __tikkaClientNotes?: Map<string, Record<string, ClientNote>> }).__tikkaClientNotes ??= new Map());

export async function getClients(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<Client[]> {
  if (user.role !== "owner") return [];
  const now = new Date();
  const [bookings, ledger, leads] = await Promise.all([
    getBookings(user, new Date(now.getTime() - 400 * 86_400_000), new Date(now.getTime() + 200 * 86_400_000)),
    getLedger(user),
    getLeads(user).catch(() => []),
  ]);
  const claims: TikkaClaim[] = leads.map((l) => ({ name: l.name, phone: l.phone, reward: l.reward, claimedAt: l.claimedAt, redeemedAt: l.redeemedAt, spentKobo: l.spent ? l.spent * 100 : undefined }));
  return buildClients({ bookings, sales: ledger.sales, claims, notes: isDbId(user.id) ? {} : (notes.get(user.id) ?? {}), now });
}

export async function getClient(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, key: string): Promise<{ client: Client; all: Client[] } | null> {
  const all = await getClients(user);
  const client = all.find((c) => c.key === key);
  return client ? { client, all } : null;
}

/** Notes and birthday ("MM-DD"), demo only for now. */
export async function saveClientNote(user: Pick<SessionUser, "id" | "role">, key: string, note: ClientNote): Promise<boolean> {
  if (user.role !== "owner" || isDbId(user.id)) return false;
  const mine = notes.get(user.id) ?? {};
  mine[key] = {
    notes: note.notes?.trim().slice(0, 500) || undefined,
    birthday: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(note.birthday ?? "") ? note.birthday : undefined,
  };
  notes.set(user.id, mine);
  return true;
}
