-- Reviews (TECH_PLAN §9). Rule 6: only people who redeemed can review, once per claim, within
-- 30 days. Businesses can report a review, never edit or delete it; Tikka keeps or hides it.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.claims (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  drop_id uuid not null references public.drops (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body varchar(140),
  display_name text not null,
  status text not null default 'visible' check (status in ('visible', 'reported', 'hidden')),
  created_at timestamptz not null default now()
);
create index reviews_business on public.reviews (business_id, created_at desc);

-- Reports from businesses (reviews) and visitors (drops) for Tikka's admin queue.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('drop', 'review')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 200),
  reporter_business_id uuid references public.businesses (id) on delete set null,
  reporter_visitor_hash text,
  status text not null default 'open' check (status in ('open', 'kept', 'hidden')),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index reports_open on public.reports (created_at) where status = 'open';

alter table public.reviews enable row level security;
alter table public.reports enable row level security;

-- Reviews carry a first name and initial only, so anyone can read the ones on show (a reported
-- review stays up until Tikka decides). The business sees hidden ones too.
create policy "read shown or own reviews" on public.reviews for select to anon, authenticated
  using (status <> 'hidden' or private.is_member(business_id) or private.is_admin());
create policy "owners read their reports" on public.reports for select to authenticated
  using (private.is_owner(reporter_business_id) or private.is_admin());
revoke insert, update, delete on public.reviews, public.reports from anon, authenticated;

-- The business's rating: every review on show (visible or reported, not hidden).
create function private.refresh_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b uuid := coalesce(new.business_id, old.business_id);
begin
  update public.businesses set (rating_avg, rating_count) = (
    select round(avg(rating), 1), count(*) from public.reviews where business_id = b and status <> 'hidden'
  ) where id = b;
  return null;
end;
$$;
create trigger reviews_rating after insert or delete or update of status, rating on public.reviews
  for each row execute function private.refresh_rating();

-- /t/[token]/review. The view token is the secret, so only the server calls it.
-- Returns {kind: 'ok'} or {kind: 'not_found' | 'not_redeemed' | 'reviewed' | 'closed' | 'invalid'}.
create function public.submit_review(p_view_token text, p_rating int, p_body text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cl public.claims%rowtype;
  d public.drops%rowtype;
  v_body text := nullif(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g'), '');
begin
  -- Locked, so two taps on "Send" make one review.
  select * into cl from public.claims where view_token = p_view_token for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if exists (select 1 from public.reviews where claim_id = cl.id) then
    return jsonb_build_object('kind', 'reviewed');
  end if;
  if cl.redeemed_at is null then
    return jsonb_build_object('kind', 'not_redeemed');
  end if;
  if cl.redeemed_at < now() - interval '30 days' then
    return jsonb_build_object('kind', 'closed');
  end if;
  if p_rating is null or p_rating not between 1 and 5 or char_length(coalesce(v_body, '')) > 140 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into d from public.drops where id = cl.drop_id;
  insert into public.reviews (claim_id, business_id, drop_id, rating, body, display_name)
  values (cl.id, d.business_id, d.id, p_rating, v_body,
          private.shown_name(cl.first_name, (select wa_profile_name from public.leads where id = cl.lead_id)));
  insert into public.events (drop_id, business_id, type, first_name)
  values (d.id, d.business_id, 'reviewed', cl.first_name);
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- The business flags a review for Tikka. It stays up until Tikka decides.
create function public.report_review(p_review uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = p_review for update;
  if not found or not private.is_owner(r.business_id) then
    raise exception 'Only the business owner can report this review' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'visible' then
    return r.status = 'reported';
  end if;
  update public.reviews set status = 'reported' where id = r.id;
  insert into public.reports (target_type, target_id, reason, reporter_business_id)
  values ('review', r.id, left(trim(p_reason), 200), r.business_id);
  return true;
end;
$$;

-- Tikka's admin keeps a reported review (back to visible) or hides it.
create function public.decide_review_report(p_review uuid, p_hide boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  update public.reviews set status = case when p_hide then 'hidden' else 'visible' end where id = p_review;
  update public.reports set status = case when p_hide then 'hidden' else 'kept' end, decided_at = now(), decided_by = auth.uid()
  where target_type = 'review' and target_id = p_review and status = 'open';
end;
$$;

-- The business page's reviews, newest first, 10 a page.
create function public.get_business_reviews(p_business uuid, p_page int default 0)
returns table (id uuid, display_name text, rating smallint, body text, drop_title text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.display_name, r.rating, r.body, d.title, r.created_at
  from public.reviews r left join public.drops d on d.id = r.drop_id
  where r.business_id = p_business and r.status <> 'hidden'
  order by r.created_at desc
  limit 10 offset greatest(p_page, 0) * 10;
$$;

revoke all on function public.submit_review(text, int, text) from public, anon, authenticated;
grant execute on function public.submit_review(text, int, text) to service_role;
revoke all on function public.report_review(uuid, text), public.decide_review_report(uuid, boolean) from public, anon;
grant execute on function public.report_review(uuid, text), public.decide_review_report(uuid, boolean) to authenticated;
grant execute on function public.get_business_reviews(uuid, int) to anon, authenticated;
revoke all on function private.refresh_rating() from public, anon, authenticated;
