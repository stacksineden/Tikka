-- Four more business page styles (decided 25 Nov 2026): 'luxe' and 'soft' for beauty businesses,
-- 'portfolio' and 'film' for photographers (prototypes in design/page-styles/). Only the look
-- changes. Additive only: the allowed values grow; every existing row keeps its style (null still
-- follows the category).

alter table public.business_page drop constraint if exists business_page_style_check;
alter table public.business_page
  add constraint business_page_style_check check (style in ('beauty', 'photography', 'luxe', 'soft', 'portfolio', 'film'));
