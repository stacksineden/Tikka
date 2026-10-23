-- Card setup in the database (PRD A7): every new business gets its permanent "Shop counter"
-- poster, and owners add posters and change their line through functions (writes to `posters`
-- are revoked). The line under "Scan to get your Tikka" follows rule 8.

alter table public.posters add constraint posters_hook_words check (private.clean_words(hook_line));

-- "K7M3QP": six characters from the code alphabet, unique across Tikka.
create function private.poster_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  c text;
begin
  loop
    select string_agg(substr('ACDEFGHJKMNPQRTUVWXY34679', 1 + floor(private.crypto_random() * 25)::int, 1), '')
    into c from generate_series(1, 6);
    exit when not exists (select 1 from public.posters where code = c);
  end loop;
  return c;
end;
$$;

create or replace function public.create_business(
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
  insert into public.drop_vouchers (business_id, tier_id, source) values (b, 'free', 'signup');
  -- The permanent poster, ready to print before the first drop (it opens the business page until then).
  insert into public.posters (business_id, code, label) values (b, private.poster_code(), 'Shop counter');
  return b;
end;
$$;

-- "Add a poster for another spot" (Mall, Gym next door). Up to 20.
create function public.add_poster(p_business uuid, p_label text) returns public.posters
language plpgsql security definer set search_path = '' as $$
declare
  p public.posters;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can add posters' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.businesses where id = p_business for update;
  if (select count(*) from public.posters where business_id = p_business) >= 20 then
    raise exception 'You can have up to 20 posters' using errcode = 'check_violation';
  end if;
  insert into public.posters (business_id, code, label) values (p_business, private.poster_code(), trim(p_label))
  returning * into p;
  return p;
end;
$$;

-- The line under "Scan to get your Tikka". Empty goes back to the everyday line.
create function public.save_poster_hook(p_poster uuid, p_hook text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  select business_id into b from public.posters where id = p_poster;
  if b is null or not private.is_owner(b) then
    raise exception 'Only the owner can change posters' using errcode = 'insufficient_privilege';
  end if;
  update public.posters set hook_line = nullif(trim(p_hook), '') where id = p_poster;
end;
$$;

revoke all on function public.add_poster(uuid, text), public.save_poster_hook(uuid, text) from public, anon;
grant execute on function public.add_poster(uuid, text), public.save_poster_hook(uuid, text) to authenticated;
revoke all on function private.poster_code() from public, anon, authenticated;
