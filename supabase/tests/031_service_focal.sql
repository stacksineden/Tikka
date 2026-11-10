-- Service photo focus points: saved with each service, defaulting to the upper third, pulled back
-- inside the photo when out of range, and only the owner can set them.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c031-000000000001', 'owner31@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c031-000000000002', 'other31@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c031-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Focus Page', 'focuspage', 'FP', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');

do $$
declare
  biz uuid := (select v from t where k = 'biz');
begin
  assert public.save_services(biz, '[
    {"name": "Bridal glam", "price_kind": "ask", "image_path": "images/x/service/a.webp", "focal_x": 0.25, "focal_y": 0.6},
    {"name": "No focus", "price_kind": "ask"},
    {"name": "Too far", "price_kind": "ask", "focal_x": 1.7, "focal_y": -0.2}
  ]') = 3, 'three services';
  assert (select (focal_x, focal_y) = (0.25, 0.6) from public.business_services where business_id = biz and name = 'Bridal glam'), 'focus saved';
  assert (select (focal_x, focal_y) = (0.5, 0.3) from public.business_services where business_id = biz and name = 'No focus'), 'default: upper third';
  assert (select (focal_x, focal_y) = (1, 0) from public.business_services where business_id = biz and name = 'Too far'), 'clamped into the photo';
end $$;

-- Another signed-in person can't move them.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c031-000000000002","role":"authenticated"}', true);
do $$
declare
  n int;
begin
  update public.business_services set focal_x = 0.9 where business_id = (select v from t where k = 'biz');
  get diagnostics n = row_count;
  assert n = 0, 'a stranger moved a focus point';
end $$;
reset role;

rollback;
