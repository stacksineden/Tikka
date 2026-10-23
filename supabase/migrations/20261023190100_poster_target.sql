-- /q/[code] (a poster scan, anonymous): which business a poster belongs to, and nothing else.
-- Posters themselves stay owner-only.
create function public.poster_target(p_code text) returns table (poster_id uuid, business_id uuid, slug text, label text)
language sql stable security definer set search_path = '' as $$
  select p.id, b.id, b.slug, p.label
  from public.posters p join public.businesses b on b.id = p.business_id
  where p.code = upper(trim(p_code)) and not b.suspended;
$$;
grant execute on function public.poster_target(text) to anon, authenticated;
