-- The owners' edit policies were `for all`, which made two select policies per table (one for
-- everyone, one for owners). Split into insert, update and delete so reads check one policy.

drop policy "owners edit services" on public.business_services;
create policy "owners add services" on public.business_services for insert to authenticated with check (private.is_owner(business_id));
create policy "owners change services" on public.business_services for update to authenticated using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners remove services" on public.business_services for delete to authenticated using (private.is_owner(business_id));

drop policy "owners edit portfolio" on public.business_portfolio;
create policy "owners add portfolio" on public.business_portfolio for insert to authenticated with check (private.is_owner(business_id));
create policy "owners change portfolio" on public.business_portfolio for update to authenticated using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners remove portfolio" on public.business_portfolio for delete to authenticated using (private.is_owner(business_id));

drop policy "owners edit team" on public.business_team;
create policy "owners add team" on public.business_team for insert to authenticated with check (private.is_owner(business_id));
create policy "owners change team" on public.business_team for update to authenticated using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners remove team" on public.business_team for delete to authenticated using (private.is_owner(business_id));

drop policy "owners edit faqs" on public.business_faqs;
create policy "owners add faqs" on public.business_faqs for insert to authenticated with check (private.is_owner(business_id));
create policy "owners change faqs" on public.business_faqs for update to authenticated using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners remove faqs" on public.business_faqs for delete to authenticated using (private.is_owner(business_id));
