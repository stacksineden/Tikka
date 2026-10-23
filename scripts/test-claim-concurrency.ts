// The parallel claim test (CLAUDE.md rules 1–3): 320 claims hit claim_card() at the same moment,
// through the same REST endpoint the WhatsApp webhook uses, for a drop of 100 Tikkas with one
// legendary. 300 different numbers, plus 20 of them sending a second claim at the same time.
// Expected: exactly 100 cards out, none twice, exactly one legendary, one claim per number, and
// everyone else told it's sold out. Codes made in SQL must pass lib/codes.ts.
//
// Then 10 queue runs at once take 200 card replies: each goes out once.
//
// Run: pnpm test:concurrency (needs .env.local with the Supabase URL and secret key, and the
// Supabase CLI linked). It creates a throwaway business and deletes it afterwards.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWellFormed } from "../lib/codes";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

const SLUG = "tikka-concurrency-test";
const PEOPLE = 300;
const REPEATS = 20;
const headers = { apikey: key, "Content-Type": "application/json" };

function sql(query: string) {
  const file = join(mkdtempSync(join(tmpdir(), "tikka-")), "q.sql");
  writeFileSync(file, query);
  execFileSync("supabase", ["db", "query", "--linked", "-f", file], { stdio: "pipe" });
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const phone = (n: number) => `+2349${String(n).padStart(9, "0")}`;
const cleanup = () =>
  sql(`delete from public.businesses where slug = '${SLUG}';
       delete from public.wa_contacts where phone like '+2349%';
       delete from public.wa_messages where phone like '+2349%';`);

async function main() {
  cleanup();
  // The fixture: a business, a live drop of 100 (1 legendary, 9 rare, 90 thank-you), its deck,
  // and one claim intent per message we're about to send.
  sql(`
    with b as (
      insert into public.businesses (name, slug, code_prefix, category, state, city, area, brand_color, on_brand_color, is_demo)
      values ('Concurrency Test', '${SLUG}', 'XQ', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF', true) returning id
    ), d as (
      insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
      select id, 'rush', 'Rush test', 100, 0, now() - interval '1 hour', now() + interval '1 day', 'published' from b returning id
    )
    insert into public.rewards (drop_id, tier, kind, value, title, quantity)
    select id, t.tier, 'percent_off', t.v, t.title, t.q from d,
      (values ('legendary', 100, 'Free', 1), ('rare', 30, '30% off', 9), ('common', 10, '10% off', 90)) t(tier, v, title, q);
    select private.build_deck(d.id) from public.drops d join public.businesses b on b.id = d.business_id where b.slug = '${SLUG}';
    -- A few spare, in case two random tokens come out the same.
    insert into public.claim_intents (drop_id, token, first_name)
    select d.id, private.intent_token(), 'Test'
    from public.drops d join public.businesses b on b.id = d.business_id, generate_series(1, ${PEOPLE + REPEATS + 20})
    where b.slug = '${SLUG}'
    on conflict (token) do nothing;
  `);

  const [drop] = await rest<{ id: string }[]>(`drops?select=id,businesses!inner(slug)&businesses.slug=eq.${SLUG}`);
  const intents = (await rest<{ token: string }[]>(`claim_intents?select=token&drop_id=eq.${drop.id}`)).slice(0, PEOPLE + REPEATS);
  if (intents.length !== PEOPLE + REPEATS) throw new Error(`expected ${PEOPLE + REPEATS} intents, got ${intents.length}`);

  // Everyone at once.
  const sends = intents.map((intent, i) => ({ token: intent.token, phone: phone(i < PEOPLE ? i : i - PEOPLE) }));
  const started = Date.now();
  const results = await Promise.all(
    sends.map(async (s) => {
      const [r] = await rest<{ result: string; claim_id: string | null }[]>("rpc/claim_card", {
        method: "POST",
        body: JSON.stringify({ p_intent_token: s.token, p_phone: s.phone }),
      });
      return { ...s, ...r };
    }),
  );
  const ms = Date.now() - started;

  const claims = await rest<{ id: string; phone: string; code: string; card_id: string; cards: { rewards: { tier: string } } }[]>(
    `claims?select=id,phone,code,card_id,cards!claims_card_id_fkey(rewards(tier))&drop_id=eq.${drop.id}`,
  );
  const left = await rest<unknown[]>(`cards?select=id&drop_id=eq.${drop.id}&status=eq.available`);

  const count = (r: string) => results.filter((x) => x.result === r).length;
  const byId = new Map(claims.map((c) => [c.id, c]));
  const checks: [string, boolean][] = [
    ["exactly 100 'claimed' answers", count("claimed") === 100],
    ["exactly 100 claims stored", claims.length === 100],
    ["no card given twice", new Set(claims.map((c) => c.card_id)).size === 100],
    ["the deck is empty", left.length === 0],
    ["exactly one legendary", claims.filter((c) => c.cards.rewards.tier === "legendary").length === 1],
    ["exactly nine rare", claims.filter((c) => c.cards.rewards.tier === "rare").length === 9],
    ["one claim per number", new Set(claims.map((c) => c.phone)).size === 100],
    ["only claimed, duplicate or sold out", results.every((r) => ["claimed", "duplicate", "sold_out"].includes(r.result))],
    ["everyone else is sold out or a repeat", count("sold_out") + count("duplicate") === PEOPLE + REPEATS - 100],
    ["a repeat gets their own card back", results.filter((r) => r.result === "duplicate").every((r) => byId.get(r.claim_id!)?.phone === r.phone)],
    ["every code is well formed", claims.every((c) => c.code.startsWith("XQ-") && isWellFormed(c.code))],
    ["codes are unique", new Set(claims.map((c) => c.code)).size === 100],
  ];

  console.log(`${sends.length} claims in ${ms} ms: ${count("claimed")} claimed, ${count("sold_out")} sold out, ${count("duplicate")} repeats`);
  for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
  await queueRace(drop.id);
}

// Two cron runs at once never send the same message: 10 runs take from 200 queued card replies.
async function queueRace(dropId: string) {
  sql(`
    insert into public.wa_contacts (phone, last_inbound_at) select phone, now() from public.claims where drop_id = '${dropId}'
    on conflict (phone) do update set last_inbound_at = now();
    select public.enqueue_message(c.phone, 'card', '{}', d.business_id, c.id, 'race:' || c.id || ':' || g)
    from public.claims c join public.drops d on d.id = c.drop_id, generate_series(1, 2) g where c.drop_id = '${dropId}';
  `);
  const runs = await Promise.all(
    Array.from({ length: 10 }, () => rest<{ id: string }[]>("rpc/take_outbound", { method: "POST", body: JSON.stringify({ p_limit: 30 }) })),
  );
  const ids = runs.flat().map((m) => m.id);
  const checks: [string, boolean][] = [
    ["every queued message taken", ids.length === 200],
    ["no message taken twice", new Set(ids).size === ids.length],
    ["no run over its limit", runs.every((r) => r.length <= 30)],
  ];
  console.log(`10 queue runs at once took ${ids.length} messages`);
  for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
