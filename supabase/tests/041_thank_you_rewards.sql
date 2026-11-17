-- The ready-made offers carry the stronger Thank-you (revenue plan item 5): a free extra with a
-- purchase instead of a small percentage, and the same 36 template ids as before.
begin;

do $$
declare
  ty jsonb;
begin
  assert (select count(*) from public.drop_templates where active) = 36, 'still 36 offers';
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
