-- Tikka Studio lives at usetikka.com/studio, so no business can take that address (or Spark's, or
-- the development test phone's). Matches lib/slug.ts.
insert into public.reserved_slugs (slug) values ('studio'), ('spark'), ('dev') on conflict do nothing;
