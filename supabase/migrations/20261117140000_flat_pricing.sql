-- Flat pricing (docs/REVENUE_PLAN.md, NOW item 2). One paid level, "Drop": ₦10,000, or ₦5,000 for
-- founding members, up to 1,000 Tikkas, guarantee at 10. The free first drop also goes up to
-- 1,000. The 3-drop season pack is ₦25,000, or ₦12,000 for founding members. Adding Tikkas to a
-- live drop costs nothing up to 1,000. Over 1,000: talk to us.
--
-- Small and Large are switched off, not deleted: drops, payments and vouchers point at them and
-- keep working and showing as they were. Unused Small or Large drops-without-paying become drops
-- of the one paid level, and any new one (an old payment credited, the guarantee on an old drop,
-- an admin grant) is filed there too. Drops already published keep their price and setup.

-- ------------------------------------------------------------- the tiers

alter table public.drop_tiers add column active boolean not null default true;

update public.drop_tiers set max_cards = 1000 where id = 'free';
update public.drop_tiers set label = 'Drop', max_cards = 1000, price_kobo = 1000000, founding_price_kobo = 500000,
  guarantee_min_redemptions = 10, sort = 1 where id = 'medium';
update public.drop_tiers set active = false where id in ('small', 'large');

-- The paid level new drops use: the largest active paid tier.
create function private.paid_tier() returns public.drop_tiers
language sql stable security definer set search_path = '' as $$
  select * from public.drop_tiers where active and price_kobo > 0 order by max_cards desc limit 1;
$$;

-- ------------------------------------------------------------- the packs

alter table public.drop_packs add column founding_price_kobo int check (founding_price_kobo > 0);
update public.drop_packs set price_kobo = 2500000, founding_price_kobo = 1200000, active = true where id = 'medium3';
update public.drop_packs set active = false where id = 'small3';

-- ------------------------------------------------- drops-without-paying

-- Every drop-without-paying is for the one paid level (or the free first drop).
create function private.file_voucher_tier() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.drop_tiers t where t.id = new.tier_id and not t.active) then
    new.tier_id := (private.paid_tier()).id;
  end if;
  return new;
end;
$$;
create trigger file_voucher_tier before insert or update of tier_id on public.drop_vouchers
for each row execute function private.file_voucher_tier();

-- Unused ones from the old sizes, so nobody loses out.
update public.drop_vouchers set tier_id = 'medium'
where used_by_drop_id is null and tier_id in (select id from public.drop_tiers where not active);

-- The free first drop goes first, then the one that expires soonest.
create or replace function private.pick_voucher(p_business uuid, p_total int) returns public.drop_vouchers
language sql stable set search_path = '' as $$
  select v.* from public.drop_vouchers v join public.drop_tiers t on t.id = v.tier_id
  where v.business_id = p_business and v.used_by_drop_id is null and (v.expires_at is null or v.expires_at > now())
    and t.max_cards >= p_total
  order by (v.source = 'signup') desc, t.max_cards, v.expires_at nulls last, v.created_at
  limit 1;
$$;

-- --------------------------------------------------------------- quotes

-- As before (lib/pricing.ts quoteDrop), over the active tiers only.
create or replace function private.quote(p_business uuid, p_total int) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v public.drop_vouchers;
  t public.drop_tiers%rowtype;
  founding boolean := coalesce((select founding_member from public.business_private where business_id = p_business), false);
  largest int := (select max(max_cards) from public.drop_tiers where active and price_kobo > 0);
begin
  if p_total > largest then
    return jsonb_build_object('kind', 'contact', 'max', largest);
  end if;
  v := private.pick_voucher(p_business, p_total);
  if v.id is not null then
    return jsonb_build_object('kind', 'voucher', 'tier', v.tier_id, 'voucher_id', v.id, 'source', v.source);
  end if;
  select * into t from public.drop_tiers where active and price_kobo > 0 and max_cards >= p_total order by max_cards limit 1;
  return jsonb_build_object('kind', 'paid', 'tier', t.id,
    'amount_kobo', case when founding then t.founding_price_kobo else t.price_kobo end,
    'free_max', (select ft.max_cards from public.drop_tiers ft join public.drop_vouchers sv on sv.tier_id = ft.id
                 where sv.business_id = p_business and sv.source = 'signup' and sv.used_by_drop_id is null));
end;
$$;

-- A season pack, at the founding price for founding members.
create or replace function public.buy_pack(p_business uuid, p_pack text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pk public.drop_packs%rowtype;
  pay public.payments;
  founding boolean;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can buy drops' using errcode = 'insufficient_privilege';
  end if;
  select * into pk from public.drop_packs where id = p_pack and active;
  if not found then
    raise exception 'No such pack' using errcode = 'no_data_found';
  end if;
  founding := coalesce((select founding_member from public.business_private where business_id = p_business), false);
  pay := private.new_payment(p_business, 'pack',
    case when founding then coalesce(pk.founding_price_kobo, pk.price_kobo) else pk.price_kobo end,
    null, pk.id, null, pk.tier_id, null);
  return jsonb_build_object('payment_id', pay.id, 'reference', pay.paystack_reference, 'amount_kobo', pay.amount_kobo);
end;
$$;

-- "Add more Tikkas": free up to 1,000 (or the drop's own size, if an old Large drop is bigger).
-- Past that, talk to us. There's no paying between sizes any more.
create or replace function public.add_tikkas(p_drop uuid, p_extra int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  cap int;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can add Tikkas' using errcode = 'insufficient_privilege';
  end if;
  if d.status <> 'published' or d.ends_at <= now() or p_extra is null or p_extra < 1 then
    return jsonb_build_object('kind', 'problem', 'problem', 'not_live');
  end if;
  cap := greatest(coalesce(d.tier_max_cards, 0), (private.paid_tier()).max_cards);
  if d.total_cards + p_extra > cap then
    return jsonb_build_object('kind', 'contact', 'max', cap);
  end if;
  perform private.append_cards(d.id, p_extra);
  update public.drops set tier_max_cards = cap where id = d.id and tier_max_cards < cap;
  return jsonb_build_object('kind', 'added', 'total', d.total_cards + p_extra);
end;
$$;

-- -------------------------------------------------------------- admin

-- Season packs: price, founding price and on sale or not. The 3-argument call still works.
drop function public.admin_save_pack(text, int, boolean);
create function public.admin_save_pack(p_pack text, p_price_kobo int, p_active boolean, p_founding_kobo int default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  update public.drop_packs
  set price_kobo = p_price_kobo, active = p_active, founding_price_kobo = coalesce(p_founding_kobo, founding_price_kobo)
  where id = p_pack;
end;
$$;

revoke all on function public.admin_save_pack(text, int, boolean, int) from public, anon;
grant execute on function public.admin_save_pack(text, int, boolean, int) to authenticated;
revoke all on function private.paid_tier(), private.file_voucher_tier() from public, anon, authenticated;
