-- The drop builder in the database. The columns are what claiming, pricing and the guarantee
-- read; `builder` keeps the builder's own copy of a draft (how each reward was worded, the mix,
-- "start now", the run length) so a draft, or "Run it again", reopens exactly as it was left.
alter table public.drops add column builder jsonb;

create or replace function public.save_drop_draft(p_business uuid, p_drop uuid, p_draft jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.drops := jsonb_populate_record(null::public.drops, p_draft);
  d public.drops%rowtype;
  id_out uuid;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can change drops' using errcode = 'insufficient_privilege';
  end if;
  if p_drop is null then
    insert into public.drops (business_id, slug, title, goal, template_id, total_cards, finish, eligibility, period_days,
      new_reserved_pct, show_in_marketplace, marketplace_cap, starts_at, ends_at, validity_days, valid_weekdays, bounce_back,
      audience_band, ignored_warnings, copied_from, builder)
    values (p_business, r.slug, trim(r.title), coalesce(r.goal, 'new_customers'), r.template_id, r.total_cards,
      coalesce(r.finish, 'foil'), coalesce(r.eligibility, 'once_per_drop'), r.period_days, coalesce(r.new_reserved_pct, 70),
      coalesce(r.show_in_marketplace, true), r.marketplace_cap, r.starts_at, r.ends_at, coalesce(r.validity_days, 14),
      r.valid_weekdays, r.bounce_back, r.audience_band, coalesce(r.ignored_warnings, '{}'), r.copied_from, p_draft -> 'builder')
    returning id into id_out;
  else
    select * into d from public.drops where id = p_drop and business_id = p_business for update;
    if not found then
      raise exception 'No such drop' using errcode = 'no_data_found';
    end if;
    if d.status <> 'draft' then
      raise exception 'Only drafts can be changed' using errcode = 'check_violation';
    end if;
    update public.drops set slug = r.slug, title = trim(r.title), goal = coalesce(r.goal, 'new_customers'), template_id = r.template_id,
      total_cards = r.total_cards, finish = coalesce(r.finish, 'foil'), eligibility = coalesce(r.eligibility, 'once_per_drop'),
      period_days = r.period_days, new_reserved_pct = coalesce(r.new_reserved_pct, 70),
      show_in_marketplace = coalesce(r.show_in_marketplace, true), marketplace_cap = r.marketplace_cap,
      starts_at = r.starts_at, ends_at = r.ends_at, validity_days = coalesce(r.validity_days, 14), valid_weekdays = r.valid_weekdays,
      bounce_back = r.bounce_back, audience_band = r.audience_band, ignored_warnings = coalesce(r.ignored_warnings, '{}'),
      builder = p_draft -> 'builder'
    where id = p_drop;
    delete from public.rewards where drop_id = p_drop;
    id_out := p_drop;
  end if;

  insert into public.rewards (drop_id, tier, kind, value, title, action_text, terms, quantity, min_spend_kobo, requires_purchase, cost_kobo)
  select id_out, x.tier, x.kind, x.value, trim(x.title), x.action_text, x.terms, x.quantity, x.min_spend_kobo,
         coalesce(x.requires_purchase, false), x.cost_kobo
  from jsonb_populate_recordset(null::public.rewards, coalesce(p_draft -> 'rewards', '[]')) x;
  return id_out;
end;
$$;
