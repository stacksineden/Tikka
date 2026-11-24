-- Business cards, step 5 (docs/BUSINESS_CARDS.md): "card" becomes a source. Someone who scans a
-- business card lands on the business page with ?c=card; if they claim from the page's drop band,
-- the claim (and its link activity) counts as "Business card". Only the claim intent's list of
-- sources changes; create_claim_intent() is otherwise as in 20261023220000_claim_page.sql.

alter table public.claim_intents drop constraint claim_intents_source_check;
alter table public.claim_intents add constraint claim_intents_source_check
  check (source in ('wa', 'ig', 'qr', 'web', 'ads', 'market', 'card', 'direct'));

create or replace function public.create_claim_intent(p_drop uuid, p_first_name text, p_future_drops boolean, p_visitor_id text, p_source text, p_poster uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  i public.claim_intents%rowtype;
  tok text;
  name text := left(trim(coalesce(p_first_name, '')), 30);
begin
  select * into d from public.drops where id = p_drop;
  if not found or d.status not in ('published', 'ended_early')
     or exists (select 1 from public.businesses b where b.id = d.business_id and b.suspended) then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if d.status = 'ended_early' or d.ends_at <= now() then
    return jsonb_build_object('kind', 'ended');
  end if;
  if d.starts_at > now() then
    return jsonb_build_object('kind', 'scheduled');
  end if;
  if not exists (select 1 from public.cards c where c.drop_id = d.id and c.status = 'available') then
    return jsonb_build_object('kind', 'sold_out');
  end if;
  if name = '' then
    raise exception 'A first name is needed' using errcode = 'check_violation';
  end if;

  select * into i from public.claim_intents
  where drop_id = d.id and visitor_id = p_visitor_id and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if found then
    update public.claim_intents set first_name = name, future_drops = coalesce(p_future_drops, false) where id = i.id;
    return jsonb_build_object('kind', 'intent', 'token', i.token, 'expires_at', i.expires_at);
  end if;

  loop
    tok := private.intent_token();
    exit when not exists (select 1 from public.claim_intents where token = tok);
  end loop;
  insert into public.claim_intents (drop_id, token, first_name, future_drops, visitor_id, source, poster_id)
  values (d.id, tok, name, coalesce(p_future_drops, false), p_visitor_id,
          case when p_source in ('wa', 'ig', 'qr', 'web', 'ads', 'market', 'card', 'direct') then p_source else 'direct' end,
          (select p.id from public.posters p where p.id = p_poster and p.business_id = d.business_id))
  returning * into i;
  return jsonb_build_object('kind', 'intent', 'token', i.token, 'expires_at', i.expires_at);
end;
$$;
