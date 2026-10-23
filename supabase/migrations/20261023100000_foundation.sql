-- Foundation (TECH_PLAN §2, §3): profiles, businesses, team membership, and the checks every
-- other table's row-level security uses. Rule 4 lives here: access is decided in SQL, not React.

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------- profiles

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Every new sign-up gets a profile (never an admin; that's set by hand).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------- businesses

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$'),
  code_prefix char(2) not null unique check (code_prefix ~ '^[A-Z]{2}$'),
  category text not null,
  state text not null,
  city text not null,
  area text not null,
  address text,
  tagline text,
  about text check (char_length(about) <= 800),
  brand_color text not null check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  on_brand_color text not null check (on_brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_type text not null default 'color' check (background_type in ('color', 'pattern', 'photo')),
  background_value text,
  logo_path text,
  video_path text,
  video_poster_path text,
  hours jsonb,
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 4),
  serve_mode text not null default 'in_store' check (serve_mode in ('in_store', 'online', 'come_to_you')),
  verified boolean not null default false,
  suspended boolean not null default false,
  rating_avg numeric(2, 1),
  rating_count int not null default 0,
  -- Demo and sales-seed businesses: never in public counts, tickers, the marketplace or landing
  -- strips (their own page still works, for sales conversations).
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Owner-only details, kept off the public table so a business page can never leak them.
create table public.business_private (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  owner_whatsapp text check (owner_whatsapp ~ '^\+234[0-9]{10}$'),
  daily_summary boolean not null default true,
  tour_done boolean not null default false,
  founding_member boolean not null default false,
  guarantee_used boolean not null default false
);

-- Words that clash with Tikka's own pages can't be a business's address (lib/slug.ts).
create table public.reserved_slugs (slug text primary key);
insert into public.reserved_slugs (slug) values
  ('drops'), ('d'), ('t'), ('b'), ('q'), ('app'), ('admin'), ('api'), ('og'), ('login'), ('signup'),
  ('sign-in'), ('sign-up'), ('pricing'), ('terms'), ('privacy'), ('help'), ('about'), ('settings'),
  ('check-email'), ('forgot-password'), ('reset-password'), ('auth'), ('static'), ('_next'), ('tikka');

create function public.reject_reserved_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.reserved_slugs r where r.slug = new.slug) then
    raise exception 'usetikka.com/% is reserved', new.slug using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger businesses_reserved_slug
  before insert or update of slug on public.businesses
  for each row execute function public.reject_reserved_slug();

-- ---------------------------------------------------------- membership

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user on public.business_members (user_id);

-- One owner per business.
create unique index one_owner_per_business on public.business_members (business_id) where role = 'owner';

create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role = 'staff'),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'base64'),
  invited_by uuid not null references auth.users (id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

-- -------------------------------------------- the checks RLS relies on

-- Security definer and stable so policies can call them without recursing into RLS.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.user_id = auth.uid()), false);
$$;

create function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m where m.business_id = b and m.user_id = auth.uid());
$$;

create function public.is_owner(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m where m.business_id = b and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- ------------------------------------------------------------------ RLS

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_private enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invites enable row level security;
alter table public.reserved_slugs enable row level security;

-- Profiles: yourself, or an admin. Nobody can make themselves an admin.
create policy "read own profile" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Only the display name; is_admin is set by Tikka directly.
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Businesses are public pages: anyone can read one that isn't suspended (members and admins
-- see theirs regardless). Owner-only details live in business_private.
create policy "anyone reads live businesses" on public.businesses for select to anon, authenticated
  using (not suspended or public.is_member(id) or public.is_admin());
create policy "owners update their business" on public.businesses for update to authenticated
  using (public.is_owner(id))
  with check (public.is_owner(id));
-- Owners may only change their own page fields; verified, suspended, ratings and is_demo are
-- Tikka's (admin functions, service role).
revoke update on public.businesses from anon, authenticated;
grant update (name, slug, code_prefix, category, state, city, area, address, tagline, about, brand_color,
  on_brand_color, background_type, background_value, logo_path, video_path, video_poster_path, hours,
  actions, serve_mode) on public.businesses to authenticated;
revoke insert, delete on public.businesses from anon, authenticated;
-- Creating a business goes through create_business() (it also makes you the owner).

create policy "owners read private details" on public.business_private for select to authenticated
  using (public.is_owner(business_id) or public.is_admin());
create policy "owners update private details" on public.business_private for update to authenticated
  using (public.is_owner(business_id))
  with check (public.is_owner(business_id));
revoke update on public.business_private from anon, authenticated;
grant update (owner_whatsapp, daily_summary, tour_done) on public.business_private to authenticated;
revoke insert, delete on public.business_private from anon, authenticated;

-- Members: you see your own memberships; owners see their team. Only owners change it,
-- through invite and remove functions (no direct writes).
create policy "read memberships" on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner(business_id) or public.is_admin());

create policy "owners read invites" on public.business_invites for select to authenticated
  using (public.is_owner(business_id));
revoke insert, update, delete on public.business_members, public.business_invites from anon, authenticated;
revoke insert, update, delete on public.reserved_slugs from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

create policy "anyone reads reserved slugs" on public.reserved_slugs for select to anon, authenticated using (true);

-- ------------------------------------------------- creating a business

-- Card setup's last step: the business, its owner membership, in one go.
create function public.create_business(
  p_name text, p_slug text, p_code_prefix text, p_category text, p_state text, p_city text, p_area text,
  p_brand_color text, p_on_brand_color text, p_actions jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.business_members m where m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'You already have a business' using errcode = 'unique_violation';
  end if;
  insert into public.businesses (name, slug, code_prefix, category, state, city, area, brand_color, on_brand_color, actions)
  values (trim(p_name), lower(p_slug), upper(p_code_prefix), p_category, p_state, p_city, p_area, p_brand_color, p_on_brand_color, p_actions)
  returning id into b;
  insert into public.business_members (business_id, user_id, role) values (b, auth.uid(), 'owner');
  insert into public.business_private (business_id) values (b);
  return b;
end;
$$;

revoke all on function public.create_business from public, anon;
grant execute on function public.create_business to authenticated;
