-- Portfolio collections (PRD A5, TECH_PLAN §3). The free page shows one grid of up to 20 photos
-- and videos (3 videos). A paid drop opens more: 60 items (8 videos) and up to 8 collections
-- ("Bridal", "Gele"), each with its own link and Book button.
--
-- Open means: a founding member; or a season pack (or a paid drop) still waiting to be used; or
-- a paid drop, from the moment it's published until 7 days after it ends. The free first drop
-- never opens it. When it closes nothing is hidden or deleted: collections can't be created,
-- changed, reordered or filled, and the free limits are back for new uploads. Removing a photo
-- always works. The server decides (rule 11): nothing here trusts the browser.

create table public.business_collections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name varchar(30) not null check (trim(name) <> '' and private.clean_words(name)),
  -- The link: usetikka.com/<business>/work/<slug>. Set once, so shared links keep working.
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
  -- The service its Book button asks for, by name (services are saved whole, so ids change).
  service_name varchar(40),
  cover_id uuid references public.business_portfolio (id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug),
  unique (id, business_id)
);
create index business_collections_order on public.business_collections (business_id, position);

-- A photo sits in one collection of its own business, or in none ("More work").
alter table public.business_portfolio
  add column collection_id uuid,
  add constraint business_portfolio_collection foreign key (collection_id, business_id)
    references public.business_collections (id, business_id) on delete set null (collection_id);
create index business_portfolio_collection on public.business_portfolio (collection_id) where collection_id is not null;

-- ------------------------------------------------------------ is it open?

-- reason: 'founding' | 'pack' | 'drop'. until: when it closes (null while there's no date yet).
create function private.portfolio_window(p_business uuid, out is_open boolean, out reason text, out until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  is_open := false;
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

create function private.portfolio_open(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select w.is_open from private.portfolio_window(p_business) w;
$$;

-- What the editor shows: open or not, why, until when, and the limits that apply right now.
-- The business's own team and Tikka admins only.
create function public.portfolio_plan(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
begin
  if not (private.is_member(p_business) or private.is_admin()) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  select * into w from private.portfolio_window(p_business);
  return jsonb_build_object(
    'open', w.is_open, 'reason', w.reason, 'until', w.until,
    'items', case when w.is_open then 60 else 20 end,
    'videos', case when w.is_open then 8 else 3 end,
    'collections', case when w.is_open then 8 else 0 end);
end;
$$;

-- ------------------------------------------------------------ limits

-- Replaces page_limit('12') for the portfolio: the cap depends on whether it's open.
create function private.portfolio_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  is_open boolean;
  cap int := 20;
  video_cap int := 3;
  n int;
  v int;
begin
  perform 1 from public.businesses where id = new.business_id for update;
  is_open := private.portfolio_open(new.business_id);
  if is_open then
    cap := 60;
    video_cap := 8;
  end if;
  select count(*), count(*) filter (where kind = 'video') into n, v from public.business_portfolio where business_id = new.business_id;
  if n >= cap then
    raise exception 'Up to % photos and videos on your page', cap using errcode = 'check_violation';
  end if;
  if new.kind = 'video' and v >= video_cap then
    raise exception 'Up to % videos', video_cap using errcode = 'check_violation';
  end if;
  if new.collection_id is not null and not is_open then
    raise exception 'Collections are locked' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger portfolio_limit on public.business_portfolio;
create trigger portfolio_limit before insert on public.business_portfolio for each row execute function private.portfolio_limit();

-- ------------------------------------------------------------ RLS

alter table public.business_collections enable row level security;
create policy "read collections" on public.business_collections for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
-- Written only through the functions below, which check the owner and that it's open.
revoke insert, update, delete on public.business_collections from anon, authenticated;

-- ------------------------------------------------------------ the owner's changes

create function private.collections_guard(p_business uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can change the page' using errcode = 'insufficient_privilege';
  end if;
  if not private.portfolio_open(p_business) then
    raise exception 'Collections are locked' using errcode = 'check_violation';
  end if;
end;
$$;

-- "Bridal & Gele" → "bridal-gele", then "-2", "-3" if the business already has one.
create function private.collection_slug(p_business uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  base text := left(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), 27);
  s text;
  n int := 1;
begin
  base := trim(both '-' from base);
  if base = '' then
    base := 'collection';
  end if;
  s := base;
  while exists (select 1 from public.business_collections where business_id = p_business and slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end;
$$;

-- Create (p_id null) or change a collection: its name, the service its Book button asks for and
-- its cover photo. Returns its id.
create function public.save_collection(p_business uuid, p_id uuid, p_name text, p_service text default null, p_cover uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := p_id;
  cover uuid;
begin
  perform private.collections_guard(p_business);
  perform 1 from public.businesses where id = p_business for update;
  if cid is null then
    if (select count(*) from public.business_collections where business_id = p_business) >= 8 then
      raise exception 'Up to 8 collections' using errcode = 'check_violation';
    end if;
    insert into public.business_collections (business_id, name, slug, service_name, position)
    values (p_business, trim(p_name), private.collection_slug(p_business, p_name), nullif(trim(p_service), ''),
            coalesce((select max(position) + 1 from public.business_collections where business_id = p_business), 0))
    returning id into cid;
    return cid;
  end if;
  -- The cover is one of this collection's own photos, or the first one.
  select p.id into cover from public.business_portfolio p where p.id = p_cover and p.business_id = p_business and p.collection_id = cid;
  update public.business_collections set name = trim(p_name), service_name = nullif(trim(p_service), ''), cover_id = cover
  where id = cid and business_id = p_business;
  if not found then
    raise exception 'No such collection' using errcode = 'no_data_found';
  end if;
  return cid;
end;
$$;

-- Removes a collection. Its photos stay on the page, under "More work".
create function public.remove_collection(p_business uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.collections_guard(p_business);
  delete from public.business_collections where id = p_id and business_id = p_business;
end;
$$;

create function public.order_collections(p_business uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.collections_guard(p_business);
  update public.business_collections c set position = x.o - 1
  from unnest(p_ids) with ordinality as x(id, o)
  where c.id = x.id and c.business_id = p_business;
end;
$$;

-- Moves photos into a collection, or out of every collection (p_collection null). Returns how many moved.
create function public.file_portfolio(p_business uuid, p_ids uuid[], p_collection uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.collections_guard(p_business);
  if p_collection is not null and not exists (select 1 from public.business_collections where id = p_collection and business_id = p_business) then
    raise exception 'No such collection' using errcode = 'no_data_found';
  end if;
  update public.business_portfolio set collection_id = p_collection where business_id = p_business and id = any (p_ids);
  get diagnostics n = row_count;
  -- A cover that moved out stops being the cover.
  update public.business_collections c set cover_id = null
  where c.business_id = p_business and c.cover_id = any (p_ids) and c.id is distinct from p_collection;
  return n;
end;
$$;

-- ------------------------------------------------------------ the page

-- get_business_page(): the collections (in the owner's order, with how many items each holds)
-- and each portfolio item's collection. Shown whether or not it's open right now.
create or replace function public.get_business_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.businesses%rowtype;
  p public.business_page%rowtype;
  in_store boolean;
begin
  select * into b from public.businesses where slug = lower(p_slug) and not suspended;
  if not found then
    return null;
  end if;
  select * into p from public.business_page where business_id = b.id;
  in_store := b.serve_mode = 'in_store';

  return jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'category', b.category,
      'state', b.state, 'city', b.city, 'area', b.area, 'tagline', b.tagline, 'about', b.about,
      'brand_color', b.brand_color, 'on_brand_color', b.on_brand_color,
      'background_type', b.background_type, 'background_value', b.background_value,
      'logo_path', b.logo_path, 'video_path', b.video_path, 'video_poster_path', b.video_poster_path,
      'actions', b.actions, 'serve_mode', b.serve_mode, 'verified', b.verified, 'is_demo', b.is_demo,
      'rating', b.rating_avg, 'review_count', b.rating_count,
      -- Online and come-to-you businesses don't show where they are.
      'address', case when in_store then b.address end,
      'hours', case when in_store then b.hours end),
    'page', jsonb_build_object(
      'hero_image_path', p.hero_image_path, 'hero_focal', jsonb_build_object('x', p.hero_focal_x, 'y', p.hero_focal_y),
      'headline', p.headline, 'subline', p.subline, 'about_image_path', p.about_image_path,
      'text', case when p.show_text then jsonb_build_object('title', p.text_title, 'body', p.text_body) end),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'group_name', s.group_name, 'name', s.name, 'description', s.description,
        'price_kobo', s.price_kobo, 'price_kind', s.price_kind, 'duration', s.duration, 'image_path', s.image_path) order by s.position)
      from public.business_services s where s.business_id = b.id), '[]'),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'service_name', c.service_name, 'cover_id', c.cover_id,
        'items', (select count(*) from public.business_portfolio x where x.collection_id = c.id)) order by c.position, c.created_at)
      from public.business_collections c where c.business_id = b.id), '[]'),
    'portfolio', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'image_path', x.image_path, 'thumb_path', x.thumb_path,
        'caption', x.caption, 'duration_s', x.duration_s, 'collection_id', x.collection_id) order by x.position, x.created_at)
      from public.business_portfolio x where x.business_id = b.id), '[]'),
    'team', case when p.show_team then coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'role', t.role, 'photo_path', t.photo_path) order by t.position)
      from public.business_team t where t.business_id = b.id), '[]') end,
    'faqs', case when p.show_faqs then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'question', f.question, 'answer', f.answer) order by f.position)
      from public.business_faqs f where f.business_id = b.id), '[]') end,
    -- Live and upcoming drops: what's in them and how many are left, never the deck.
    'drops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'slug', d.slug, 'title', d.title, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
        'total', d.total_cards,
        'left', d.total_cards - (select count(*) from public.claims c where c.drop_id = d.id and c.kind = 'drop'),
        'legendary', (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'legendary'),
        'rare', (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'rare'),
        'waiting', public.notify_waiting(b.id, d.id)) order by d.starts_at)
      from public.drops d where d.business_id = b.id and d.status = 'published' and d.ends_at > now()), '[]'),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r)) from public.get_business_reviews(b.id, 0) r), '[]'),
    'following', public.notify_waiting(b.id)
  );
end;
$$;

-- ------------------------------------------------------------ grants

revoke all on function private.portfolio_window(uuid), private.portfolio_open(uuid), private.portfolio_limit(),
  private.collections_guard(uuid), private.collection_slug(uuid, text) from public, anon, authenticated;
revoke all on function public.portfolio_plan(uuid), public.save_collection(uuid, uuid, text, text, uuid), public.remove_collection(uuid, uuid),
  public.order_collections(uuid, uuid[]), public.file_portfolio(uuid, uuid[], uuid) from public, anon;
grant execute on function public.portfolio_plan(uuid), public.save_collection(uuid, uuid, text, text, uuid), public.remove_collection(uuid, uuid),
  public.order_collections(uuid, uuid[]), public.file_portfolio(uuid, uuid[], uuid) to authenticated;
