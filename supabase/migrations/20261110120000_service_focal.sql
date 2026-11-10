-- Service photos are uploaded whole (no crop on upload). The owner taps the part of the photo that
-- matters and the business page's service card crops around it (PRD A5, Services). The default
-- sits in the upper third, where a face usually is.

alter table public.business_services
  add column focal_x numeric(4, 3) not null default 0.5 check (focal_x between 0 and 1),
  add column focal_y numeric(4, 3) not null default 0.3 check (focal_y between 0 and 1);

grant update (focal_x, focal_y) on public.business_services to authenticated;

create or replace function public.save_services(p_business uuid, p_services jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (business_id, group_name, name, description, price_kobo, price_kind, duration, image_path, focal_x, focal_y, position)
  select p_business, nullif(trim(s ->> 'group_name'), ''), trim(s ->> 'name'), nullif(trim(s ->> 'description'), ''),
         (s ->> 'price_kobo')::int, coalesce(s ->> 'price_kind', 'fixed'), nullif(trim(s ->> 'duration'), ''),
         nullif(s ->> 'image_path', ''),
         -- Out-of-range taps are pulled back inside the photo, never refused.
         round(least(greatest(coalesce((s ->> 'focal_x')::numeric, 0.5), 0), 1), 3),
         round(least(greatest(coalesce((s ->> 'focal_y')::numeric, 0.3), 0), 1), 3),
         (o - 1)::int
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;
