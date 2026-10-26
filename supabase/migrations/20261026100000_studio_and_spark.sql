-- Tikka Studio enquiries (PRD B11) and Spark early access (PRD B12). Visitors and owners never
-- touch these tables directly: enquiries and signed-out sign-ups go through server-only functions
-- (the app rate-limits them first), owners sign their own business up, and only admins read.

create table public.studio_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  business_name text not null check (char_length(business_name) between 1 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  services text[] not null default '{}' check (services <@ array['websites', 'whatsapp', 'follow_up', 'ads', 'drops']),
  budget_range text check (char_length(budget_range) <= 60),
  note text check (char_length(note) <= 1000),
  source_case_study text check (source_case_study ~ '^[a-z0-9-]{1,80}$'),
  business_id uuid references public.businesses (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at timestamptz not null default now()
);
create index studio_enquiries_new on public.studio_enquiries (created_at desc);

create table public.early_access (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature in ('spark')),
  business_id uuid references public.businesses (id) on delete cascade,
  contact text check (contact ~ '^(\+[1-9][0-9]{7,14}|[^@\s]+@[^@\s]+\.[^@\s]+)$' and char_length(contact) <= 160),
  created_at timestamptz not null default now(),
  check (business_id is not null or contact is not null),
  unique (feature, business_id),
  unique (feature, contact)
);

create table public.teaser_dismissals (
  business_id uuid not null references public.businesses (id) on delete cascade,
  teaser text not null check (teaser in ('spark_builder', 'spark_dashboard')),
  created_at timestamptz not null default now(),
  primary key (business_id, teaser)
);

alter table public.studio_enquiries enable row level security;
alter table public.early_access enable row level security;
alter table public.teaser_dismissals enable row level security;
revoke all on public.studio_enquiries, public.early_access, public.teaser_dismissals from anon, authenticated;

-- An enquiry from /studio/contact. Server only (the app checks the rate limit first). A business
-- id is kept only when the caller says who's signed in; the app passes the owner's own business.
create function public.submit_studio_enquiry(
  p_name text, p_business_name text, p_phone text, p_services text[], p_budget_range text default null,
  p_note text default null, p_source_case_study text default null, p_business uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.studio_enquiries (name, business_name, phone, services, budget_range, note, source_case_study, business_id)
  values (trim(p_name), trim(p_business_name), p_phone, coalesce(p_services, '{}'), nullif(trim(coalesce(p_budget_range, '')), ''),
          nullif(trim(coalesce(p_note, '')), ''), nullif(p_source_case_study, ''), p_business)
  returning id into new_id;
  return new_id;
end;
$$;

-- Spark early access for the caller's own business (one tap in the dashboard). Signing up twice
-- changes nothing. Staff can't sign the business up; owners only.
create function public.join_early_access(p_feature text, p_business uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can sign the business up' using errcode = 'insufficient_privilege';
  end if;
  insert into public.early_access (feature, business_id) values (p_feature, p_business) on conflict do nothing;
  return true;
end;
$$;

-- Spark early access from a signed-out visitor (the landing page): an email or WhatsApp number,
-- already normalised by the app. Server only; signing up twice changes nothing.
create function public.join_early_access_contact(p_feature text, p_contact text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.early_access (feature, contact) values (p_feature, lower(trim(p_contact))) on conflict do nothing;
  return true;
end;
$$;

-- What the dashboard needs: is this business on the list, and which teasers has it dismissed.
-- Members of the business may ask (staff see the same teasers, but can't sign up or dismiss).
create function public.spark_state(p_business uuid)
returns table (on_list boolean, dismissed text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_business) then
    raise exception 'Not a member of this business' using errcode = 'insufficient_privilege';
  end if;
  return query select
    exists (select 1 from public.early_access a where a.feature = 'spark' and a.business_id = p_business),
    coalesce((select array_agg(d.teaser order by d.teaser) from public.teaser_dismissals d where d.business_id = p_business), '{}');
end;
$$;

create function public.dismiss_teaser(p_business uuid, p_teaser text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can hide this' using errcode = 'insufficient_privilege';
  end if;
  insert into public.teaser_dismissals (business_id, teaser) values (p_business, p_teaser) on conflict do nothing;
end;
$$;

-- Admin: Studio enquiries, newest first, and their status.
create function public.admin_studio_enquiries() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'business_name', e.business_name, 'phone', e.phone, 'services', e.services,
        'budget_range', e.budget_range, 'note', e.note, 'source_case_study', e.source_case_study,
        'tikka_business', b.name, 'status', e.status, 'created_at', e.created_at)
      order by e.created_at desc)
    from (select * from public.studio_enquiries order by created_at desc limit 300) e
    left join public.businesses b on b.id = e.business_id), '[]');
end;
$$;

create function public.admin_set_enquiry_status(p_enquiry uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  update public.studio_enquiries set status = p_status where id = p_enquiry;
end;
$$;

-- Admin: Spark early-access count and list (business name, or the contact left on the landing page).
create function public.admin_early_access(p_feature text default 'spark') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return jsonb_build_object(
    'count', (select count(*) from public.early_access where feature = p_feature),
    'list', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', b.name, 'business_slug', b.slug, 'contact', a.contact, 'created_at', a.created_at)
        order by a.created_at desc)
      from (select * from public.early_access where feature = p_feature order by created_at desc limit 500) a
      left join public.businesses b on b.id = a.business_id), '[]'));
end;
$$;

revoke all on function public.submit_studio_enquiry(text, text, text, text[], text, text, text, uuid), public.join_early_access_contact(text, text)
  from public, anon, authenticated;
grant execute on function public.submit_studio_enquiry(text, text, text, text[], text, text, text, uuid), public.join_early_access_contact(text, text)
  to service_role;
revoke all on function public.join_early_access(text, uuid), public.spark_state(uuid), public.dismiss_teaser(uuid, text),
  public.admin_studio_enquiries(), public.admin_set_enquiry_status(uuid, text), public.admin_early_access(text)
  from public, anon;
grant execute on function public.join_early_access(text, uuid), public.spark_state(uuid), public.dismiss_teaser(uuid, text),
  public.admin_studio_enquiries(), public.admin_set_enquiry_status(uuid, text), public.admin_early_access(text)
  to authenticated;
