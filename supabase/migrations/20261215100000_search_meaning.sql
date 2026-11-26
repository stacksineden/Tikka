-- Search that understands what people mean (docs/HOMEPAGE_PLAN.md): "bridal makeup" finds "Traditional
-- bridal glam", "soft glam" finds a makeup artist, "braiding" finds "Knotless braids". Each word of the
-- search counts on its own (with plurals and -ing), words that mean the same thing count as one
-- (makeup = glam = MUA = beat), and a business doing that kind of work still shows when its service
-- names use other words. Businesses that match every word come first; the rest come back marked
-- 'related' so the page can say so. search_businesses() keeps its arguments and adds 'match'.

-- Words that mean the same thing, each group with the kind of work it belongs to (TRADES in
-- lib/presets.ts). A term ending in * matches the start of a word ("photo*" finds photoshoot);
-- otherwise the whole word, with s, es, ed or ing after it ("braid" finds braids and braiding).
create function private.search_groups() returns table (grp text, term text, trade text)
language sql immutable set search_path = '' as $$
  select g.grp, t.term, g.trade
  from (values
    ('makeup', 'makeup', array['makeup', 'make-up', 'make up', 'mua', 'glam*', 'beat', 'cosmetic', 'facebeat']),
    ('bridal', null, array['bridal', 'bride', 'wedding', 'engagement', 'introduction']),
    ('braid', 'hair', array['braid*', 'knotless', 'cornrow', 'twist', 'plait*', 'stitch', 'crochet', 'loc', 'dread*', 'fulani']),
    ('wig', 'hair', array['wig', 'frontal', 'closure', 'install*', 'unit', 'revamp*']),
    ('press', 'hair', array['silk press', 'press', 'blow*', 'relax*', 'retouch*', 'treatment', 'wash']),
    ('hair', 'hair', array['hair*', 'salon', 'stylist', 'weav*', 'ponytail', 'extension']),
    ('nails', 'nails', array['nail*', 'manicure', 'pedicure', 'mani', 'pedi', 'acrylic', 'gel', 'gelx', 'biab', 'polygel', 'press on', 'press-on']),
    ('lashes', 'lashes', array['lash*', 'eyelash*', 'cluster']),
    ('brows', 'lashes', array['brow*', 'eyebrow*', 'microblad*', 'lamination', 'tint*']),
    ('barber', 'barber', array['barb*', 'haircut', 'cut', 'fade', 'shave', 'lineup', 'line up', 'beard', 'low cut']),
    ('spa', 'spa', array['spa', 'massage', 'facial', 'scrub', 'wax*', 'sauna', 'steam']),
    ('gele', 'gele', array['gele', 'headtie', 'head tie', 'head-tie', 'turban']),
    ('photo', 'photo', array['photo*', 'shoot', 'portrait', 'picture', 'pictorial', 'headshot', 'studio session', 'pics']),
    ('video', 'video', array['video*', 'film*', 'cinemat*', 'coverage', 'drone']),
    ('content', 'content', array['content', 'reel', 'ugc', 'tiktok', 'instagram']),
    ('birthday', null, array['birthday', 'bday', 'b-day']),
    ('graduation', null, array['graduation', 'convocation', 'matric*', 'graduand']),
    ('maternity', null, array['maternity', 'pregnan*', 'bump', 'baby shower']),
    ('kids', null, array['kid', 'child', 'children', 'baby'])
  ) as g(grp, trade, terms)
  cross join lateral unnest(g.terms) as t(term);
$$;

-- The pattern for one term, matched against lower-case text.
create function private.search_pattern(p_term text) returns text
language sql immutable set search_path = '' as $$
  select case when right(p_term, 1) = '*'
    then '\m' || regexp_replace(left(p_term, -1), '([^a-z0-9 ])', '\\\1', 'g')
    else '\m' || regexp_replace(p_term, '([^a-z0-9 ])', '\\\1', 'g') || '(s|es|ed|ing)?\M' end;
$$;

-- The words of a search, each with what it can match: itself (without a plural or -ing ending) and,
-- when it's in a group, every word of that group and the group's kind of work. Little words
-- ("in", "for", "near me", "services", "artist") don't count.
create function private.search_words(p_query text)
returns table (n int, patterns text[], trades text[])
language sql immutable set search_path = '' as $$
  with w as (
    select row_number() over () :: int as n, word,
      case
        when word ~ '(shes|ches|xes)$' then left(word, -2)
        when word ~ 'ing$' and length(word) >= 7 then left(word, -3)
        when word ~ '[^s]s$' and length(word) >= 4 then left(word, -1)
        else word end as stem
    from (
      select x as word
      from regexp_split_to_table(lower(coalesce(p_query, '')), '[^a-z0-9]+') with ordinality as s(x, i)
      where length(x) >= 2
        and x not in ('in', 'at', 'on', 'near', 'me', 'for', 'and', 'the', 'a', 'an', 'of', 'my', 'to', 'with',
                      'service', 'services', 'artist', 'artists', 'artistry', 'best', 'cheap', 'affordable', 'professional', 'done', 'do')
      order by i
    ) q
  )
  select w.n,
    array_agg(distinct private.search_pattern(t)) ,
    coalesce(array_agg(distinct g2.trade) filter (where g2.trade is not null), '{}')
  from w
  left join lateral (
    select distinct g.grp from private.search_groups() g
    where w.stem ~ ('^' || private.search_pattern(g.term)) or w.word ~ ('^' || private.search_pattern(g.term))
  ) g1 on true
  left join private.search_groups() g2 on g2.grp = g1.grp
  cross join lateral unnest(array[w.stem, g2.term]) t
  where t is not null
  group by w.n;
$$;

-- The kinds of work a business does, from its trades or else the words of its services.
create function private.search_business_trades(p_trades text[], p_text text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(p_trades, '{}') || coalesce((
    select array_agg(distinct g.trade) from private.search_groups() g
    where g.trade is not null and p_text ~ private.search_pattern(g.term)), '{}');
$$;

create or replace function public.search_businesses(
  p_query text default null, p_trade text default null, p_place text default null,
  p_from date default null, p_to date default null, p_tod text default null,
  p_sort text default 'soonest', p_limit int default 24
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
        (x.card ->> 'score')::numeric desc,
        case when p_sort = 'rating' then -coalesce((x.card ->> 'rating')::numeric, 0) end,
        case when p_sort = 'new' then (x.card ->> 'joined')::timestamptz end desc,
        (x.card ->> 'place_rank')::numeric desc,
        (x.card ->> 'next_free')::timestamptz nulls last,
        -coalesce((x.card ->> 'rating')::numeric, 0)) as n
    from (
      select jsonb_build_object(
          'slug', b.slug, 'name', b.name, 'category', b.category, 'trades', to_jsonb(b.trades),
          'area', b.area, 'city', b.city, 'state', b.state,
          'comes_to_you', coalesce(b.work_place, 'shop') <> 'shop', 'only_comes_to_you', b.work_place = 'home',
          'logo_path', b.logo_path, 'brand_color', b.brand_color,
          'cover_path', coalesce(p.hero_image_path,
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
          else 0 end as rank
      ) pr
      where not b.suspended and not b.is_demo and b.listed
        and exists (select 1 from public.business_services v where v.business_id = b.id)
        and pr.rank > 0
        and (p_trade is null or p_trade = ''
             or b.trades @> array[p_trade]
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


revoke all on function public.search_businesses(text, text, text, date, date, text, text, int) from public;
grant execute on function public.search_businesses(text, text, text, date, date, text, text, int) to anon, authenticated, service_role;
