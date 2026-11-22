-- The gallery's background (decided 22 Nov 2026): the business page is the business's own website,
-- so it uses neutral black or white rather than Tikka's colours (Tikka shows only in "Made with
-- Tikka" and the drop band's Claim button). The owner picks Dark (the default, null) or Light under
-- "More options" on Your page; only the Photography (gallery) style uses it.

alter table public.business_page
  add column gallery_tone text check (gallery_tone in ('dark', 'light'));
grant update (gallery_tone) on public.business_page to authenticated;
