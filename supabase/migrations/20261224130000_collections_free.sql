-- Collections for everyone (27 Nov 2026): every business can sort its work into up to 8 collections,
-- each with its own page and Book button, free. What a paid drop (or a season pack, or founding)
-- still adds is room: 60 photos and videos with 8 videos, instead of 20 with 3. When that room
-- closes nothing is hidden or deleted; uploads go back to the free limit as before.

create or replace function public.portfolio_plan(p_business uuid) returns jsonb
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
    'collections', 8);
end;
$$;

-- The room still depends on the plan; filing into a collection no longer does.
create or replace function private.portfolio_limit() returns trigger
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
  return new;
end;
$$;

-- Owners only, as before; open to every business.
create or replace function private.collections_guard(p_business uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can change the page' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
