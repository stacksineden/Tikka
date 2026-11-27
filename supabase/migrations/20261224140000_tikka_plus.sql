-- Tikka Plus (decided 27 Nov 2026): ₦10,000 a month, paid month by month (card or transfer through
-- Paystack, no saved cards, nothing charged automatically). It adds, for as long as it lasts:
-- - a drop each month: each payment brings one drop-without-paying that runs out with the month;
-- - featured in Tikka's search: shown first among the matches, marked Featured;
-- - room for 60 photos and 8 videos (the portfolio's paid room, private.portfolio_window());
-- - no "Made with Tikka" on the business page (the page reads businesses.plus_until).
-- When it ends nothing breaks: photos, collections and the page style stay; the extras stop.
-- Every page style, bookings, deposits (1% to Tikka, unchanged) and the rest stay free.
-- Also: asking Tikka to set up their own web address (domain_requests), shown to Tikka admin.

-- The price, read on the server (like drop_tiers and drop_packs) and by the pricing page.
create table public.plus_prices (
  id text primary key,
  price_kobo int not null check (price_kobo > 0),
  days int not null check (days between 1 and 366),
  active boolean not null default true
);
insert into public.plus_prices (id, price_kobo, days) values ('monthly', 1000000, 30);
alter table public.plus_prices enable row level security;
create policy "anyone reads active plus prices" on public.plus_prices for select to anon, authenticated using (active or private.is_admin());

-- Until when a business has Plus. Written only by complete_payment() and admin_set_plus().
alter table public.businesses add column plus_until timestamptz;

alter table public.payments drop constraint payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('drop', 'upgrade', 'pack', 'plus'));
alter table public.payments add column plus_days int check (plus_days between 1 and 366);
alter table public.drop_vouchers drop constraint drop_vouchers_source_check;
alter table public.drop_vouchers add constraint drop_vouchers_source_check check (source in ('signup', 'pack', 'guarantee', 'admin', 'paid', 'plus'));

-- A month of Plus: a pending payment at the server's price (founding members pay the same).
create function public.buy_plus(p_business uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pr public.plus_prices%rowtype;
  pay public.payments;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can buy Tikka Plus' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.businesses where id = p_business and (suspended or is_demo)) then
    raise exception 'Not available for this business' using errcode = 'check_violation';
  end if;
  select * into pr from public.plus_prices where id = 'monthly' and active;
  if not found then
    raise exception 'Tikka Plus is not on sale' using errcode = 'no_data_found';
  end if;
  pay := private.new_payment(p_business, 'plus', pr.price_kobo, null, null, null, null, null);
  update public.payments set plus_days = pr.days where id = pay.id;
  return jsonb_build_object('payment_id', pay.id, 'reference', pay.paystack_reference, 'amount_kobo', pay.amount_kobo);
end;
$$;
revoke all on function public.buy_plus(uuid) from public, anon;
grant execute on function public.buy_plus(uuid) to authenticated;

create or replace function public.complete_payment(p_reference text, p_amount_kobo int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  d public.drops%rowtype;
  pk public.drop_packs%rowtype;
  i int;
  v_until timestamptz;
begin
  select * into pay from public.payments where paystack_reference = p_reference for update;
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  -- An abandoned payment still completes: the money arrived.
  if pay.status not in ('pending', 'abandoned') then
    return jsonb_build_object('kind', 'already', 'status', pay.status);
  end if;
  if p_amount_kobo is distinct from pay.amount_kobo then
    update public.payments set status = 'failed' where id = pay.id;
    if pay.kind = 'drop' then
      update public.drops set payment_status = null where id = pay.drop_id and status = 'draft';
    end if;
    return jsonb_build_object('kind', 'failed');
  end if;
  update public.payments set status = 'paid', paid_at = now() where id = pay.id;

  -- Tikka Plus: 30 more days from today or from when it ends, whichever is later, and that
  -- month's drop (a drop-without-paying that runs out with the month).
  if pay.kind = 'plus' then
    update public.businesses
    set plus_until = greatest(coalesce(plus_until, now()), now()) + make_interval(days => pay.plus_days)
    where id = pay.business_id
    returning plus_until into v_until;
    insert into public.drop_vouchers (business_id, tier_id, source, pack_payment_id, expires_at)
    values (pay.business_id, (private.paid_tier()).id, 'plus', pay.id, v_until);
    return jsonb_build_object('kind', 'plus', 'until', v_until);
  end if;

  if pay.kind = 'pack' then
    select * into pk from public.drop_packs where id = pay.pack_id;
    for i in 1..pk.drops loop
      insert into public.drop_vouchers (business_id, tier_id, source, pack_payment_id, expires_at)
      values (pay.business_id, pk.tier_id, 'pack', pay.id, now() + interval '12 months');
    end loop;
    return jsonb_build_object('kind', 'pack', 'drops', pk.drops);
  end if;

  select * into d from public.drops where id = pay.drop_id for update;
  if pay.kind = 'upgrade' then
    update public.drops set tier_id = pay.to_tier, tier_max_cards = (select max_cards from public.drop_tiers where id = pay.to_tier),
      paid_with = 'payment', payment_status = 'paid'
    where id = d.id;
    perform private.append_cards(d.id, pay.extra_cards);
    return jsonb_build_object('kind', 'upgraded', 'drop_id', d.id, 'total', d.total_cards + pay.extra_cards);
  end if;

  -- A drop. If it can't go out any more, the money becomes a drop of the same size for later.
  perform 1 from public.businesses where id = d.business_id for update;
  if d.status <> 'draft' or private.window_problem(d) is not null
     or (select coalesce(sum(quantity), 0) from public.rewards where drop_id = d.id) <> d.total_cards then
    insert into public.drop_vouchers (business_id, tier_id, source) values (pay.business_id, pay.to_tier, 'paid');
    update public.drops set payment_status = null where id = d.id and status = 'draft';
    return jsonb_build_object('kind', 'credited', 'drop_id', d.id, 'tier', pay.to_tier);
  end if;
  perform private.go_live(d.id, pay.to_tier, 'payment', null);
  return jsonb_build_object('kind', 'published', 'drop_id', d.id);
end;
$$;

create or replace function private.portfolio_window(p_business uuid, out is_open boolean, out reason text, out until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  is_open := false;
  -- Tikka Plus: open until the month ends.
  select b.plus_until into until from public.businesses b where b.id = p_business and b.plus_until > now();
  if until is not null then
    is_open := true;
    reason := 'plus';
    return;
  end if;
  if coalesce((select founding_member from public.business_private where business_id = p_business), false) then
    is_open := true;
    reason := 'founding';
    return;
  end if;
  -- Paid for and not used yet: a season pack's drops, or a paid drop that couldn't go out.
  if exists (
    select 1 from public.drop_vouchers v
    where v.business_id = p_business and v.source in ('pack', 'paid') and v.used_by_drop_id is null
      and (v.expires_at is null or v.expires_at > now())
  ) then
    is_open := true;
    reason := 'pack';
    return;
  end if;
  -- A drop that wasn't the free first one, from publishing until 7 days after it ends.
  select max(d.ends_at) + interval '7 days' into until
  from public.drops d
  left join public.drop_vouchers v on v.id = d.voucher_id
  where d.business_id = p_business and d.status in ('published', 'ended_early')
    and (d.paid_with = 'payment' or (d.paid_with = 'voucher' and v.source <> 'signup'));
  if until > now() then
    is_open := true;
    reason := 'drop';
  else
    until := null;
  end if;
end;
$$;

create or replace function public.search_businesses(
  p_query text default null, p_trade text default null, p_place text default null,
  p_from date default null, p_to date default null, p_tod text default null,
  p_sort text default 'soonest', p_limit int default 24, p_include_demo boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
  v_from date := coalesce(p_from, today);
  v_to date := coalesce(p_to, coalesce(p_from, today) + 13);
  v_query text := nullif(lower(trim(coalesce(p_query, ''))), '');
  v_tokens text[] := (select array_agg(trim(x)) from unnest(string_to_array(lower(coalesce(p_place, '')), ',')) x where trim(x) <> '');
  v_tod text := case when p_tod in ('morning', 'afternoon', 'evening') then p_tod end;
  must_be_free boolean := p_from is not null or v_tod is not null;
  v_words jsonb := (select coalesce(jsonb_agg(jsonb_build_object('n', w.n, 'p', w.patterns, 't', w.trades)), '[]') from private.search_words(p_query) w);
  v_count int := jsonb_array_length(v_words);
begin
  if v_to < v_from or v_to > today + 92 then
    v_to := least(greatest(v_to, v_from), today + 92);
  end if;
  return coalesce((
    select jsonb_agg(y.card order by y.n)
    from (
    select x.card, row_number() over (order by
        (x.card ->> 'featured')::boolean desc,
        (x.card ->> 'score')::numeric desc,
        case when p_sort = 'rating' then -coalesce((x.card ->> 'rating')::numeric, 0) end,
        case when p_sort = 'new' then (x.card ->> 'joined')::timestamptz end desc,
        (x.card ->> 'place_rank')::numeric desc,
        (x.card ->> 'next_free')::timestamptz nulls last,
        -coalesce((x.card ->> 'rating')::numeric, 0)) as n
    from (
      select jsonb_build_object(
          -- Tikka Plus: shown first among the matches, marked Featured.
          'featured', coalesce(b.plus_until > now(), false),
          'slug', b.slug, 'name', b.name, 'category', b.category,
          'trades', to_jsonb(case when cardinality(b.trades) > 0 then b.trades else private.guess_trades(b.id) end),
          'area', b.area, 'city', b.city, 'state', b.state,
          'comes_to_you', coalesce(b.work_place, 'shop') <> 'shop', 'only_comes_to_you', b.work_place = 'home',
          'logo_path', b.logo_path, 'brand_color', b.brand_color,
          -- Photos of the space lead (Your Tikka listing), like the listing page; then the page's picture.
          'cover_path', coalesce(
            (select sp.thumb_path from public.business_space_photos sp where sp.business_id = b.id order by sp.position limit 1),
            (select sp.image_path from public.business_space_photos sp where sp.business_id = b.id order by sp.position limit 1),
            p.hero_image_path,
            (select f.image_path from public.business_portfolio f where f.business_id = b.id and f.kind = 'photo' order by f.position, f.created_at limit 1)),
          'rating', b.rating_avg, 'reviews', b.rating_count, 'verified', b.verified,
          'from_kobo', (select min(least(coalesce(v.price_kobo, 2147483647),
                          coalesce((select min((o ->> 'price_kobo')::int) from jsonb_array_elements(v.options) o), 2147483647)))
                        from public.business_services v where v.business_id = b.id and v.price_kind <> 'ask'),
          'deposit', coalesce(st.enabled, false) and coalesce(st.deposit_mode, 'off') <> 'off' and private.payments_problem(b.id) is null,
          'bookable', coalesce(st.enabled, false),
          'joined', b.created_at, 'is_new', b.created_at > now() - interval '30 days',
          -- The map pin: never for a business that only goes to customers (no shop to point at).
          'lat', case when b.work_place is distinct from 'home' then b.lat end,
          'lng', case when b.work_place is distinct from 'home' then b.lng end,
          'location_approx', b.location_approx,
          'amenities', to_jsonb(coalesce(b.amenities, '{}')),
          'place_rank', pr.rank,
          'score', m.score,
          'match', case when v_query is null or v_count = 0 then null when m.full then 'all' else 'related' end,
          'next_free', private.next_free(b.id, v_from, v_to, v_tod)) as card
      from public.businesses b
      left join public.business_page p on p.business_id = b.id
      left join public.booking_settings st on st.business_id = b.id
      -- Everything a search can match: the name, category and every service's words.
      cross join lateral (
        select lower(b.name || ' ' || coalesce(b.category, '') || ' ' || coalesce(array_to_string(b.trades, ' '), '') || ' ' || coalesce(string_agg(
          concat_ws(' ', v.name, v.group_name, v.description,
            (select string_agg(o ->> 'name', ' ') from jsonb_array_elements(coalesce(v.options, '[]')) o),
            (select string_agg(e ->> 'name', ' ') from jsonb_array_elements(coalesce(v.extras, '[]')) e)), ' '), '')) as text
        from public.business_services v where v.business_id = b.id
      ) hay
      -- Each word scores 2 when the business's words match it, 1 when the business does that kind of
      -- work; 'all' when every word matched its words (or the whole search is in its name).
      cross join lateral (
        select coalesce(sum(s.pts), 0) :: numeric / greatest(v_count, 1) + case when v_query is not null and lower(b.name) like '%' || v_query || '%' then 2 else 0 end as score,
               (v_query is not null and lower(b.name) like '%' || v_query || '%') or (v_count > 0 and count(*) filter (where s.pts = 2) = v_count) as full
        from (
          select case
            when exists (select 1 from jsonb_array_elements_text(w -> 'p') p where hay.text ~ p) then 2
            when (w -> 't') <> '[]' and exists (select 1 from jsonb_array_elements_text(w -> 't') t
                   where t = any (private.search_business_trades(b.trades, hay.text))) then 1
            else 0 end as pts
          from jsonb_array_elements(v_words) w
        ) s
      ) m
      cross join lateral (
        select case
          when v_tokens is null then 1
          when exists (select 1 from unnest(v_tokens) t where lower(b.area) = t) then 3
          when exists (select 1 from unnest(v_tokens) t where lower(b.city) = t or lower(b.state) = t) then 2
          -- Goes to customers: shows for where it travels (its state, its city, or its area).
          when coalesce(b.work_place, 'shop') <> 'shop' and exists (select 1 from unnest(v_tokens) t where
                 (b.travel_reach = 'state' and (lower(b.state) = t or t like '%' || lower(b.state) || '%'))
              or (b.travel_reach = 'city' and lower(b.city) = t)
              or (b.travel_reach = 'area' and lower(b.area) = t)) then 1.5
          -- Goes anywhere in Nigeria: shows wherever the customer searches.
          when coalesce(b.work_place, 'shop') <> 'shop' and b.travel_reach = 'nigeria' then 1.5
          else 0 end as rank
      ) pr
      where not b.suspended and private.in_search(b)
        -- Demo businesses never show, except to the server asking for them (local development only).
        and (not b.is_demo or (p_include_demo and auth.role() = 'service_role'))
        and exists (select 1 from public.business_services v where v.business_id = b.id)
        and pr.rank > 0
        and (p_trade is null or p_trade = ''
             or b.trades @> array[p_trade]
             or p_trade = any (private.search_business_trades(b.trades, hay.text))
             or (b.trades is null and p_trade = 'photo' and b.category = 'Photography'))
        -- A search of only little words ("services") counts as no words.
        and (v_query is null or v_count = 0 or m.score > 0)
    ) x
    where not must_be_free or x.card ->> 'next_free' is not null
    order by n
    limit least(greatest(coalesce(p_limit, 24), 1), 48)
    ) y), '[]'::jsonb);
end;
$$;

revoke all on function public.search_businesses(text, text, text, date, date, text, text, int, boolean) from public;
grant execute on function public.search_businesses(text, text, text, date, date, text, text, int, boolean) to anon, authenticated, service_role;

-- Tikka admin: give or take Plus by hand (a gift, a fix). Null ends it now.
create function public.admin_set_plus(p_business uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  update public.businesses set plus_until = p_until where id = p_business;
end;
$$;

create function public.admin_save_plus_price(p_price_kobo int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  update public.plus_prices set price_kobo = p_price_kobo where id = 'monthly';
end;
$$;

-- ------------------------------------------------------------ their own web address

create table public.domain_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  domain text check (domain is null or char_length(domain) <= 100),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'done', 'declined')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index domain_requests_open on public.domain_requests (created_at) where status in ('new', 'contacted');
alter table public.domain_requests enable row level security;
-- No direct access: request_domain() and the admin functions.

-- One open request per business at a time: asking again updates it.
create function public.request_domain(p_business uuid, p_domain text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
  d text := nullif(lower(trim(coalesce(p_domain, ''))), '');
  n text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can ask' using errcode = 'insufficient_privilege';
  end if;
  select id into rid from public.domain_requests where business_id = p_business and status in ('new', 'contacted');
  if rid is not null then
    update public.domain_requests set domain = left(d, 100), note = left(n, 500) where id = rid;
    return rid;
  end if;
  insert into public.domain_requests (business_id, domain, note, created_by) values (p_business, left(d, 100), left(n, 500), auth.uid())
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.request_domain(uuid, text, text) from public, anon;
grant execute on function public.request_domain(uuid, text, text) to authenticated;

-- The owner's own: Plus until, the price, and their open web-address request.
create function public.plus_state(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_business) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'until', (select case when plus_until > now() then plus_until end from public.businesses where id = p_business),
    'price_kobo', (select price_kobo from public.plus_prices where id = 'monthly' and active),
    'days', (select days from public.plus_prices where id = 'monthly' and active),
    'drop_left', exists (select 1 from public.drop_vouchers v where v.business_id = p_business and v.source = 'plus'
                         and v.used_by_drop_id is null and v.expires_at > now()),
    'domain', (select jsonb_build_object('domain', r.domain, 'status', r.status, 'at', r.created_at) from public.domain_requests r
               where r.business_id = p_business and r.status in ('new', 'contacted') limit 1));
end;
$$;
revoke all on function public.plus_state(uuid) from public, anon;
grant execute on function public.plus_state(uuid) to authenticated;

-- Tikka admin: who has Plus, and the web-address requests.
create function public.admin_plus() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'until', b.plus_until, 'active', b.plus_until > now()) order by b.plus_until)
                            from public.businesses b where b.plus_until > now() - interval '30 days'), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'business', b.name, 'slug', b.slug, 'domain', r.domain, 'note', r.note,
                                                              'status', r.status, 'at', r.created_at) order by r.created_at desc)
                          from public.domain_requests r join public.businesses b on b.id = r.business_id), '[]'::jsonb));
end;
$$;

create function public.admin_domain_request(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('new', 'contacted', 'done', 'declined') then
    raise exception 'Unknown status' using errcode = 'check_violation';
  end if;
  update public.domain_requests set status = p_status where id = p_id;
end;
$$;

revoke all on function public.admin_set_plus(uuid, timestamptz), public.admin_save_plus_price(int), public.admin_plus(), public.admin_domain_request(uuid, text) from public, anon;
grant execute on function public.admin_set_plus(uuid, timestamptz), public.admin_save_plus_price(int), public.admin_plus(), public.admin_domain_request(uuid, text) to authenticated;
