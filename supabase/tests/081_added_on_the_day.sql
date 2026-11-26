-- Added on the day: the visit stays one sale with the extra in its total; the sale remembers what
-- was added; once only; never more than the total; owners only; the ledger and receipt show it.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c081-000000000001', 'owner81@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c081-000000000002', 'staff81@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c081-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Added On', 'addedon81', 'AO', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
-- The balance (₦10,500) plus a wash and beads (₦4,500), paid in cash.
insert into t select 'sale', public.record_sale((select v from t where k = 'biz'), 'Ada', 'Knotless braids', 1500000, 1500000, 'cash', null, '+2348081000001');
reset role;
insert into public.business_members (business_id, user_id, role) values ((select v from t where k = 'biz'), '00000000-0000-4000-c081-000000000002', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c081-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.note_sale_added((select v from t where k = 'biz'), (select v from t where k = 'sale'), 'Wash and beads', 450000);
    assert false, 'staff must not change sales';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c081-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  sale uuid := (select v from t where k = 'sale');
  s jsonb;
begin
  assert not public.note_sale_added(biz, sale, 'Too much', 9000000), 'never more than the total';
  assert not public.note_sale_added(biz, sale, '  ', 450000), 'needs a name';
  assert public.note_sale_added(biz, sale, 'Wash and beads', 450000), 'noted';
  assert not public.note_sale_added(biz, sale, 'Again', 100000), 'once only';
  s := (select x from jsonb_array_elements(public.get_ledger(biz) -> 'sales') x where (x ->> 'id')::uuid = sale);
  assert s ->> 'added_label' = 'Wash and beads' and (s ->> 'added_kobo')::int = 450000 and (s ->> 'total_kobo')::int = 1500000, 'in the ledger: ' || s::text;
  perform public.receipt_for(biz, sale);
end $$;
reset role;
set local role service_role;
do $$
declare r jsonb := public.receipt_page((select receipt_token from public.sales where id = (select v from t where k = 'sale')));
begin
  assert r -> 'sale' ->> 'added_label' = 'Wash and beads' and (r -> 'sale' ->> 'added_kobo')::int = 450000, 'on the receipt: ' || r::text;
end $$;
reset role;

rollback;
