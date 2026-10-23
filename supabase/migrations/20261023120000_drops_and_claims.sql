-- Drops, the deck and claiming (TECH_PLAN §3, §4, §6, §7).
-- Rule 1: the server decides every card. Nobody signed in, staff or anonymous can read `cards`;
-- cards are handed out only inside claim_card(), which only the server (service role) can call.
-- Rule 2: claims are atomic: the next card is taken with FOR UPDATE SKIP LOCKED.
-- Rule 3: one claim per WhatsApp number per drop; a repeat returns the same card.

-- ------------------------------------------------------------- templates

create table public.drop_templates (
  id text primary key,
  category text not null check (category in ('beauty_hair', 'spa_wellness', 'fitness', 'food_drinks', 'fashion', 'health_clinics', 'education', 'other_services')),
  goal text not null check (goal in ('new_customers', 'bring_back', 'quiet_days')),
  name text not null,
  why_line text not null,
  rewards jsonb not null,
  bounce_back jsonb,
  default_validity_days int not null check (default_validity_days in (7, 14, 30)),
  valid_weekdays int[],
  sort int not null default 0,
  active boolean not null default true
);
alter table public.drop_templates enable row level security;
create policy "anyone reads active templates" on public.drop_templates for select to anon, authenticated using (active);
revoke insert, update, delete on public.drop_templates from anon, authenticated;

-- ---------------------------------------------------------------- drops

create table public.drops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  title text not null check (char_length(title) between 1 and 40),
  goal text not null default 'new_customers' check (goal in ('new_customers', 'bring_back', 'quiet_days')),
  template_id text references public.drop_templates (id),
  total_cards int not null check (total_cards between 10 and 3000),
  finish text not null default 'foil' check (finish in ('matte', 'foil', 'holo')),
  eligibility text not null default 'once_per_drop' check (eligibility in ('once_per_drop', 'once_per_period', 'new_only')),
  period_days int check (period_days between 1 and 365),
  new_reserved_pct int not null default 70 check (new_reserved_pct between 0 and 100),
  show_in_marketplace boolean not null default true,
  marketplace_cap int check (marketplace_cap > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  validity_days int not null default 14 check (validity_days in (7, 14, 30)),
  valid_weekdays int[] check (valid_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  bounce_back jsonb,
  audience_band text,
  ignored_warnings text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'ended_early', 'hidden')),
  published_at timestamptz,
  copied_from uuid references public.drops (id) on delete set null,
  alerted_at timestamptz,
  tier_id text references public.drop_tiers (id),
  tier_max_cards int,
  paid_with text check (paid_with in ('voucher', 'payment')),
  voucher_id uuid references public.drop_vouchers (id),
  payment_status text check (payment_status in ('free', 'pending', 'paid')),
  guarantee_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, slug),
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '30 days')
);
create index drops_business on public.drops (business_id, starts_at desc);
create index drops_live on public.drops (starts_at, ends_at) where status = 'published';

alter table public.drop_vouchers add constraint drop_vouchers_used_by_drop foreign key (used_by_drop_id) references public.drops (id) on delete set null;
alter table public.payments add constraint payments_drop foreign key (drop_id) references public.drops (id) on delete set null;

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  tier text not null check (tier in ('common', 'rare', 'legendary')),
  kind text not null check (kind in ('percent_off', 'amount_off', 'free_item', 'perk', 'action')),
  value numeric,
  title text not null check (char_length(title) between 1 and 80),
  action_text text,
  terms text check (char_length(terms) <= 60),
  quantity int not null check (quantity >= 0),
  min_spend_kobo int check (min_spend_kobo >= 0),
  requires_purchase boolean not null default false,
  cost_kobo int check (cost_kobo >= 0),
  check (kind <> 'action' or action_text is not null)
);
create index rewards_drop on public.rewards (drop_id);

-- The shuffled deck. `position` is the order cards are handed out; `serial` is the number printed
-- on the card (a separate random permutation, so serials say nothing about order).
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete cascade,
  position int not null,
  serial int not null,
  status text not null default 'available' check (status in ('available', 'claimed')),
  claim_id uuid,
  unique (drop_id, position),
  unique (drop_id, serial)
);
create index cards_next on public.cards (drop_id, status, position);

-- --------------------------------------------------------------- posters

create table public.posters (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  code char(6) not null unique check (code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{6}$'),
  label text not null check (char_length(label) between 1 and 30),
  hook_line text check (char_length(hook_line) <= 80),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------- leads and claims

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  first_name text not null,
  wa_profile_name text,
  first_seen_at timestamptz not null default now(),
  first_source text,
  claims_count int not null default 0,
  redeemed_count int not null default 0,
  last_followup_at timestamptz,
  opted_out boolean not null default false,
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  unique (business_id, phone)
);

create table public.claim_intents (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  token text not null unique check (token ~ '^TK-[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  first_name text not null check (char_length(first_name) between 1 and 30),
  future_drops boolean not null default false,
  visitor_id text,
  source text not null default 'direct' check (source in ('wa', 'ig', 'qr', 'web', 'ads', 'market', 'direct')),
  poster_id uuid references public.posters (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'duplicate', 'blocked_new_only', 'blocked_period', 'sold_out', 'market_sold_out', 'expired')),
  claim_id uuid,
  phone text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  kind text not null default 'drop' check (kind in ('drop', 'bounce_back')),
  parent_claim_id uuid references public.claims (id) on delete set null,
  card_id uuid unique references public.cards (id),
  lead_id uuid not null references public.leads (id) on delete cascade,
  phone text not null,
  first_name text not null,
  code text not null unique check (code ~ '^[A-Z]{2}-[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  view_token text not null unique,
  is_new_lead boolean not null,
  source text not null default 'direct',
  poster_id uuid references public.posters (id) on delete set null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  planned_visit_date date,
  planned_visit_part text check (planned_visit_part in ('morning', 'afternoon', 'evening')),
  reminder_sent_at timestamptz,
  redeemed_at timestamptz,
  bill_amount_kobo int check (bill_amount_kobo >= 0),
  customer_status text check (customer_status in ('new', 'returning')),
  redeemed_by uuid references auth.users (id),
  action_confirmed boolean not null default false,
  check (kind = 'bounce_back' or card_id is not null)
);
-- One Tikka per number per drop (bounce-backs don't count). Rule 3.
create unique index one_claim_per_phone_per_drop on public.claims (drop_id, phone) where kind = 'drop';
-- One bounce-back per redeemed Tikka.
create unique index one_bounce_back_per_claim on public.claims (parent_claim_id) where kind = 'bounce_back';
create index claims_drop on public.claims (drop_id, claimed_at desc);
create index claims_lead on public.claims (lead_id);

alter table public.cards add constraint cards_claim foreign key (claim_id) references public.claims (id) on delete set null;
alter table public.claim_intents add constraint claim_intents_claim foreign key (claim_id) references public.claims (id) on delete set null;

-- Link activity: anonymous until someone claims (first names only after that).
create table public.events (
  id bigint generated always as identity primary key,
  drop_id uuid references public.drops (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null check (type in ('view', 'unwrap', 'claim_tap', 'claim_continue', 'claim_completed', 'redeemed', 'reviewed', 'sold_out_view', 'notify_subscribed', 'followup_tap', 'poster_scan')),
  visitor_hash text,
  source text,
  poster_id uuid references public.posters (id) on delete set null,
  first_name text,
  amount_kobo int,
  tier text,
  created_at timestamptz not null default now()
);
create index events_drop on public.events (drop_id, created_at);
create index events_business on public.events (business_id, created_at);

-- ------------------------------------------------------------------ RLS

alter table public.drops enable row level security;
alter table public.rewards enable row level security;
alter table public.cards enable row level security;
alter table public.posters enable row level security;
alter table public.leads enable row level security;
alter table public.claim_intents enable row level security;
alter table public.claims enable row level security;
alter table public.events enable row level security;

-- Published drops are public (the claim page and marketplace); members see their drafts too.
create policy "read published or own drops" on public.drops for select to anon, authenticated
  using (status in ('published', 'ended_early') or private.is_member(business_id) or private.is_admin());
-- "What's in this drop" shows rewards and counts, never the deck.
create policy "read rewards of visible drops" on public.rewards for select to anon, authenticated
  using (exists (select 1 from public.drops d where d.id = drop_id and (d.status in ('published', 'ended_early') or private.is_member(d.business_id) or private.is_admin())));
-- Cards: no policy at all, so nobody signed in or anonymous can ever read the deck (rule 1).

create policy "owners read posters" on public.posters for select to authenticated
  using (private.is_owner(business_id) or private.is_admin());

-- Leads and claims carry phone numbers: owners only (rule 4). Staff check codes through
-- check_code() / confirm_redemption(), which never return a number.
create policy "owners read leads" on public.leads for select to authenticated
  using (private.is_owner(business_id) or private.is_admin());
create policy "owners read claims" on public.claims for select to authenticated
  using (exists (select 1 from public.drops d where d.id = drop_id and private.is_owner(d.business_id)) or private.is_admin());
-- claim_intents: server only (no policy).

-- Link activity has no numbers, so the team can see it (the live feed).
create policy "members read events" on public.events for select to authenticated
  using (private.is_member(business_id) or private.is_admin());

-- Every write goes through the server's functions (drafts and publishing come with the builder).
revoke insert, update, delete on public.drops, public.rewards, public.cards, public.posters, public.leads,
  public.claim_intents, public.claims, public.events from anon, authenticated;

-- ---------------------------------------------------------------- codes

-- Random bytes → a float in [0, 1) from the crypto RNG (random() isn't).
create function private.crypto_random() returns double precision
language sql volatile set search_path = '' as $$
  select ('x' || encode(extensions.gen_random_bytes(6), 'hex'))::bit(48)::bigint / 281474976710656.0;
$$;

-- The code alphabet and its check character (must match lib/codes.ts: weights 2, 1, 2, 1… from
-- the right over prefix + body; prefix letters outside the alphabet map through a fixed table).
create function private.code_point(ch text) returns int
language sql immutable set search_path = '' as $$
  select strpos('ACDEFGHJKMNPQRTUVWXY34679',
    case ch when 'B' then 'P' when 'I' then 'J' when 'L' then 'T' when 'O' then 'Q' when 'S' then '9' when 'Z' then '7' else ch end) - 1;
$$;

create function private.tikka_code(prefix text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';
  body text := '';
  chars text;
  total int := 0;
  w int := 2;
  i int;
begin
  for i in 1..4 loop
    body := body || substr(alphabet, 1 + floor(private.crypto_random() * 25)::int, 1);
  end loop;
  chars := upper(prefix) || body;
  for i in reverse length(chars)..1 loop
    total := total + w * private.code_point(substr(chars, i, 1));
    w := 3 - w;
  end loop;
  return upper(prefix) || '-' || body || substr(alphabet, 1 + ((25 - total % 25) % 25), 1);
end;
$$;

-- "TK-4FQ7K": the claim intent token people send on WhatsApp.
create function private.intent_token() returns text
language sql volatile set search_path = '' as $$
  select 'TK-' || string_agg(substr('ACDEFGHJKMNPQRTUVWXY34679', 1 + floor(private.crypto_random() * 25)::int, 1), '')
  from generate_series(1, 5);
$$;

-- ------------------------------------------------------------- the deck

-- Builds the shuffled deck from the drop's rewards (TECH_PLAN §4). Each reward's cards are spread
-- evenly through the deck with crypto-random jitter inside their stretch, so every stretch of the
-- deck gets its share of legendaries and rares; serials are a separate random permutation.
create function private.build_deck(p_drop uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select coalesce(sum(quantity), 0) into n from public.rewards where drop_id = p_drop;
  if n <> (select total_cards from public.drops where id = p_drop) then
    raise exception 'Rewards add up to %, not the drop''s total', n using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.cards where drop_id = p_drop) then
    raise exception 'This drop already has a deck' using errcode = 'unique_violation';
  end if;
  insert into public.cards (drop_id, reward_id, position, serial)
  select p_drop, reward_id,
         row_number() over (order by target) - 1,
         row_number() over (order by private.crypto_random())
  from (
    select r.id as reward_id, (k + private.crypto_random()) * n::double precision / r.quantity as target
    from public.rewards r, generate_series(0, r.quantity - 1) k
    where r.drop_id = p_drop and r.quantity > 0
  ) s;
  return n;
end;
$$;

-- ---------------------------------------------------------- claim_card

-- Called by the WhatsApp webhook (service role) when "Claim my Tikka TK-XXXXX" arrives.
-- Returns 'claimed' | 'duplicate' | 'blocked_new_only' | 'blocked_period' | 'sold_out' |
-- 'market_sold_out' | 'expired' | 'invalid'.
create function public.claim_card(p_intent_token text, p_phone text, p_wa_name text default null)
returns table (result text, claim_id uuid, view_token text)
language plpgsql security definer set search_path = '' as $$
declare
  i public.claim_intents%rowtype;
  d public.drops%rowtype;
  biz public.businesses%rowtype;
  existing public.claims%rowtype;
  l public.leads%rowtype;
  new_lead boolean;
  c record;
  returning_claims int;
  market_claims int;
  new_claim uuid;
  token text;
  claim_code text;
begin
  -- 1. The intent, locked; repeats of the same webhook get the stored answer.
  select * into i from public.claim_intents where token = upper(trim(p_intent_token)) for update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;
  if i.status <> 'pending' then
    return query select i.status, i.claim_id, (select cl.view_token from public.claims cl where cl.id = i.claim_id);
    return;
  end if;
  if i.expires_at < now() then
    update public.claim_intents set status = 'expired', phone = p_phone where id = i.id;
    return query select 'expired'::text, null::uuid, null::text;
    return;
  end if;

  -- 2. The drop must be live.
  select * into d from public.drops where id = i.drop_id;
  select * into biz from public.businesses where id = d.business_id;
  if d.status <> 'published' or now() < d.starts_at or now() > d.ends_at or biz.suspended then
    update public.claim_intents set status = 'expired', phone = p_phone where id = i.id;
    return query select 'expired'::text, null::uuid, null::text;
    return;
  end if;

  -- 3. One per number per drop: a repeat gets the same card back (rule 3).
  select * into existing from public.claims cl where cl.drop_id = d.id and cl.phone = p_phone and cl.kind = 'drop';
  if found then
    update public.claim_intents set status = 'duplicate', phone = p_phone, claim_id = existing.id where id = i.id;
    return query select 'duplicate'::text, existing.id, existing.view_token;
    return;
  end if;

  -- 4. The lead: new or returning to this business.
  select * into l from public.leads where business_id = d.business_id and phone = p_phone for update;
  new_lead := not found;

  -- 5. Who can claim.
  if d.eligibility = 'new_only' and not new_lead then
    update public.claim_intents set status = 'blocked_new_only', phone = p_phone where id = i.id;
    return query select 'blocked_new_only'::text, null::uuid, null::text;
    return;
  end if;
  if d.eligibility = 'once_per_period' and not new_lead and exists (
    select 1 from public.claims cl join public.drops dd on dd.id = cl.drop_id
    where dd.business_id = d.business_id and cl.phone = p_phone and cl.kind = 'drop'
      and cl.claimed_at > now() - make_interval(days => coalesce(d.period_days, 30))
  ) then
    update public.claim_intents set status = 'blocked_period', phone = p_phone where id = i.id;
    return query select 'blocked_period'::text, null::uuid, null::text;
    return;
  end if;

  -- 6. The share kept for new customers.
  if not new_lead then
    select count(*) into returning_claims from public.claims cl where cl.drop_id = d.id and cl.kind = 'drop' and not cl.is_new_lead;
    if returning_claims >= floor(d.total_cards * (100 - d.new_reserved_pct) / 100.0) then
      update public.claim_intents set status = 'sold_out', phone = p_phone where id = i.id;
      return query select 'sold_out'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  -- 7. The marketplace's limit.
  if i.source = 'market' and d.marketplace_cap is not null then
    select count(*) into market_claims from public.claims cl where cl.drop_id = d.id and cl.kind = 'drop' and cl.source = 'market';
    if market_claims >= d.marketplace_cap then
      update public.claim_intents set status = 'market_sold_out', phone = p_phone where id = i.id;
      return query select 'market_sold_out'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  -- 8. The next card, atomically: concurrent claims skip each other's locked rows (rule 2).
  select cd.id, cd.reward_id, rw.tier into c
  from public.cards cd join public.rewards rw on rw.id = cd.reward_id
  where cd.drop_id = d.id and cd.status = 'available'
  order by cd.position
  limit 1
  for update of cd skip locked;
  if not found then
    update public.claim_intents set status = 'sold_out', phone = p_phone where id = i.id;
    return query select 'sold_out'::text, null::uuid, null::text;
    return;
  end if;

  -- 9. The claim: lead, code, token, card, intent and the activity event.
  token := replace(replace(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_');
  loop
    claim_code := private.tikka_code(biz.code_prefix);
    exit when not exists (select 1 from public.claims cl where cl.code = claim_code);
  end loop;

  begin
    -- Upsert: the same number claiming two of this business's drops at once can't clash.
    insert into public.leads as x (business_id, phone, first_name, wa_profile_name, first_source, claims_count)
    values (d.business_id, p_phone, i.first_name, p_wa_name, i.source, 1)
    on conflict (business_id, phone) do update
      set claims_count = x.claims_count + 1, opted_out = false, wa_profile_name = coalesce(excluded.wa_profile_name, x.wa_profile_name)
    returning * into l;
    if i.future_drops then
      update public.leads set marketing_opt_in = true, marketing_opt_in_at = now() where id = l.id;
    end if;
    insert into public.claims (drop_id, card_id, lead_id, phone, first_name, code, view_token, is_new_lead, source, poster_id, expires_at)
    values (d.id, c.id, l.id, p_phone, i.first_name, claim_code, token, new_lead, i.source, i.poster_id,
            now() + make_interval(days => d.validity_days))
    returning id into new_claim;
  exception when unique_violation then
    -- The same number claimed this drop a moment ago in a parallel request: theirs stands, this
    -- card stays in the deck (the block's lead and claim changes roll back), and they get the same card (rule 3).
    select * into existing from public.claims cl where cl.drop_id = d.id and cl.phone = p_phone and cl.kind = 'drop';
    if not found then
      raise;
    end if;
    update public.claim_intents set status = 'duplicate', phone = p_phone, claim_id = existing.id where id = i.id;
    return query select 'duplicate'::text, existing.id, existing.view_token;
    return;
  end;

  update public.cards set status = 'claimed', claim_id = new_claim where id = c.id;
  update public.claim_intents set status = 'claimed', phone = p_phone, claim_id = new_claim where id = i.id;
  insert into public.events (drop_id, business_id, type, source, poster_id, first_name, tier)
  values (d.id, d.business_id, 'claim_completed', i.source, i.poster_id, i.first_name, c.tier);

  return query select 'claimed'::text, new_claim, token;
end;
$$;

revoke all on function public.claim_card(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_card(text, text, text) to service_role;

revoke all on function private.build_deck(uuid), private.tikka_code(text), private.intent_token(), private.crypto_random(), private.code_point(text) from public, anon, authenticated;
