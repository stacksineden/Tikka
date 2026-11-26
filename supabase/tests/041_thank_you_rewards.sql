-- The ready-made offers carry the stronger Thank-you (revenue plan item 5): a free extra with a
-- purchase instead of a small percentage, and the same 36 template ids as before
-- (more may have been added since).
begin;

do $$
declare
  ty jsonb;
begin
  -- The 36 offers from before are all still on; later migrations may add more (Photography did).
  assert (select count(*) from public.drop_templates where active and id = any (array[
      'beauty-back-1', 'beauty-back-2', 'beauty-back-3', 'beauty-new-1', 'beauty-new-2', 'beauty-new-3',
      'beauty-quiet-1', 'beauty-quiet-2', 'beauty-quiet-3', 'education-back-1', 'education-new-1', 'education-quiet-1',
      'fashion-back-1', 'fashion-new-1', 'fashion-quiet-1', 'fitness-back-1', 'fitness-new-1', 'fitness-quiet-1',
      'food-back-1', 'food-new-1', 'food-quiet-1', 'health-back-1', 'health-new-1', 'health-quiet-1',
      'services-back-1', 'services-new-1', 'services-quiet-1', 'spa-back-1', 'spa-back-2', 'spa-back-3',
      'spa-new-1', 'spa-new-2', 'spa-new-3', 'spa-quiet-1', 'spa-quiet-2', 'spa-quiet-3'])) = 36, 'the 36 offers are still there';
  select r into ty from public.drop_templates t, jsonb_array_elements(t.rewards) r
  where t.id = 'beauty-new-1' and r ->> 'tier' = 'thank_you';
  assert ty ->> 'what' = 'Free hair wash with any service' and ty ->> 'type' = 'free_item', 'First visit treat: ' || ty::text;
  select r into ty from public.drop_templates t, jsonb_array_elements(t.rewards) r
  where t.id = 'food-new-1' and r ->> 'tier' = 'thank_you';
  assert ty ->> 'what' = 'Free soft drink with any meal', 'First taste: ' || ty::text;
  assert (select count(*) from public.drop_templates t, jsonb_array_elements(t.rewards) r
          where t.active and r ->> 'tier' = 'thank_you' and r ->> 'type' in ('percent_off', 'naira_off')) = 0,
    'no Thank-you is a small percentage or ₦ off any more';
  assert (select count(*) from public.drop_templates t, jsonb_array_elements(t.rewards) r
          where t.active and r ->> 'tier' = 'thank_you' and (r ->> 'what') ~* '\m(win|winner|luck|lucky|jackpot|odds|bet|stake|lottery|raffle)\M') = 0,
    'no gambling words';
end $$;

rollback;
