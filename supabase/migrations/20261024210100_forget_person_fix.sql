-- admin_forget_person(): the loop's record was named like the claims alias in its own query.
create or replace function public.admin_forget_person(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n_claims int;
  n_reviews int;
  n_leads int;
  n_intents int;
  n_notify int;
  n_optouts int;
  n_messages int;
  n_queue int;
  n_events int := 0;
  cl record;
  counts jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;

  -- First names in the live feed: the events written when they claimed, came in or reviewed.
  for cl in select x.drop_id, x.first_name, x.claimed_at, x.redeemed_at from public.claims x where x.phone = p_phone loop
    with cleared as (
      update public.events e set first_name = null
      -- Each event matched to its own moment (within two minutes), so a namesake's stay.
      where e.drop_id = cl.drop_id and e.first_name = cl.first_name
        and ((e.type = 'claim_completed' and abs(extract(epoch from e.created_at - cl.claimed_at)) < 120)
          or (e.type = 'redeemed' and cl.redeemed_at is not null and abs(extract(epoch from e.created_at - cl.redeemed_at)) < 120)
          or (e.type = 'reviewed' and exists (select 1 from public.reviews v join public.claims y on y.id = v.claim_id
                                              where y.phone = p_phone and y.drop_id = cl.drop_id
                                                and abs(extract(epoch from e.created_at - v.created_at)) < 120)))
      returning 1)
    select n_events + count(*) into n_events from cleared;
  end loop;

  select count(*) into n_claims from public.claims where phone = p_phone;
  select count(*) into n_reviews from public.reviews v join public.claims c on c.id = v.claim_id where c.phone = p_phone;
  delete from public.reports r using public.reviews v, public.claims c
    where r.target_type = 'review' and r.target_id = v.id and v.claim_id = c.id and c.phone = p_phone;
  -- Claims go with their lead (and reviews with their claim).
  delete from public.claims where phone = p_phone;
  with d as (delete from public.leads where phone = p_phone returning 1) select count(*) into n_leads from d;
  with d as (delete from public.claim_intents where phone = p_phone returning 1) select count(*) into n_intents from d;
  with d as (delete from public.notify_subscriptions where phone = p_phone returning 1) select count(*) into n_notify from d;
  with d as (delete from public.opt_outs where phone = p_phone returning 1) select count(*) into n_optouts from d;
  with d as (delete from public.wa_messages where phone = p_phone returning 1) select count(*) into n_messages from d;
  with d as (delete from public.outbound_messages where phone = p_phone returning 1) select count(*) into n_queue from d;
  delete from public.wa_contacts where phone = p_phone;

  counts := jsonb_build_object('claims', n_claims, 'reviews', n_reviews, 'leads', n_leads, 'claim_attempts', n_intents,
    'notify', n_notify, 'opt_outs', n_optouts, 'messages', n_messages + n_queue, 'feed_names', n_events);
  insert into public.privacy_requests (kind, phone_hint, counts, done_by) values ('deleted', private.phone_hint(p_phone), counts, auth.uid());
  return counts;
end;
$$;
