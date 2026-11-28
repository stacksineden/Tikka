-- A service's description holds its terms too ("Price is for one look. Lashes extra."), shown under
-- the service on the page and in the booking sheet (28 Nov 2026): 300 characters instead of 140.
-- PAGE_LIMITS.serviceDescription in lib/page.ts matches.

alter table public.business_services alter column description type varchar(300);
