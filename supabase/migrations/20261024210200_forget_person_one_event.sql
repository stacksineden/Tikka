-- admin_forget_person(): clear one feed event per moment (the closest), never a namesake's too.
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

  -- First names in the live feed: one event per moment they claimed, came in or reviewed (the
  -- closest one, so a namesake who claimed at the same time keeps theirs).
  for cl in
    select x.drop_id, x.first_name, 'claim_completed'::text as type, x.claimed_at as at from public.claims x where x.phone = p_phone
    union all
    select x.drop_id, x.first_name, 'redeemed', x.redeemed_at from public.claims x where x.phone = p_phone and x.redeemed_at is not null
    union all
    select x.drop_id, x.first_name, 'reviewed', v.created_at from public.claims x join public.reviews v on v.claim_id = x.id where x.phone = p_phone
  loop
    update public.events set first_name = null
    where id = (
      select e.id from public.events e
      where e.drop_id = cl.drop_id and e.type = cl.type and e.first_name = cl.first_name
        and abs(extract(epoch from e.created_at - cl.at)) < 120
      order by abs(extract(epoch from e.created_at - cl.at)), e.id
      limit 1);
    if found then
      n_events := n_events + 1;
    end if;
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
