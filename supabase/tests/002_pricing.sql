-- Pricing tests: prices are public, money is owner-only, nobody writes directly, and a new
-- business gets exactly one free first drop.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b000-000000000001', 'owner2@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b000-000000000002', 'staff2@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Price Test', 'pricetest', 'PT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');

do $$ begin
  assert (select count(*) from public.drop_vouchers where business_id = (select v from t where k = 'biz') and source = 'signup' and tier_id = 'free') = 1, 'a new business gets its free first drop';
  -- Owners can't hand themselves free drops or edit prices.
  begin
    insert into public.drop_vouchers (business_id, tier_id, source) values ((select v from t where k = 'biz'), 'large', 'admin');
    raise exception 'an owner gave themselves a free drop';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.drop_tiers set price_kobo = 1 where id = 'large';
    raise exception 'an owner changed a price';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payments (business_id, kind, amount_kobo, paystack_reference, status)
    values ((select v from t where k = 'biz'), 'drop', 1, 'tk_fake', 'paid');
    raise exception 'an owner wrote a payment';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
-- A second free first drop is refused even for the service role.
do $$ begin
  begin
    insert into public.drop_vouchers (business_id, tier_id, source) select v, 'free', 'signup' from t where k = 'biz';
    raise exception 'a business got two free first drops';
  exception when unique_violation then null;
  end;
end $$;
insert into public.payments (business_id, kind, to_tier, amount_kobo, paystack_reference)
select v, 'drop', 'small', 500000, 'tk_test_ref' from t where k = 'biz';
insert into public.business_members (business_id, user_id, role)
select v, '00000000-0000-4000-b000-000000000002', 'staff' from t where k = 'biz';

-- Staff: no money, no free drops.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.payments) = 0, 'staff never see payments';
  assert (select count(*) from public.drop_vouchers) = 0, 'staff never see free drops';
  assert (select count(*) from public.drop_tiers) = 4, 'prices are readable';
end $$;

-- The owner sees theirs.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.payments where paystack_reference = 'tk_test_ref') = 1, 'owners see their payments';
end $$;

-- Anonymous visitors: prices yes, money no.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  assert (select count(*) from public.drop_tiers) = 4, 'anyone reads the tiers';
  assert (select count(*) from public.drop_packs) = 2, 'anyone reads the season packs';
  assert (select count(*) from public.payments) = 0, 'anonymous visitors never see payments';
  assert (select price_kobo from public.drop_tiers where id = 'medium') = 1000000, 'Medium is ₦10,000';
end $$;

reset role;
select 'pricing: all checks passed' as result;
rollback;
