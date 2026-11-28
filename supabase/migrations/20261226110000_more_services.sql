-- No real limit on services (28 Nov 2026). Owners sort them into groups (each group is a tab on
-- their page; services without one show under "Other"), so a long list stays easy to read. 100 only
-- stops runaway saves; PAGE_LIMITS.services in lib/page.ts matches.

drop trigger services_limit on public.business_services;
create trigger services_limit before insert on public.business_services for each row execute function private.page_limit('100');
