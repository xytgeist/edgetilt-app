-- Fill major Las Vegas geo gaps (Horseshoe + Strip / off-Strip properties missing from casino_seed).
-- Safe to re-run: upserts lat/lng by lower(name).

alter table public.casinos add column if not exists lat double precision;
alter table public.casinos add column if not exists lng double precision;

insert into public.casinos (name, source, city, state, country, lat, lng)
values
  ('Horseshoe Las Vegas',               'seed', 'Las Vegas', 'Nevada', 'United States',  36.1139,  -115.1706),
  ('Harrah''s Las Vegas',               'seed', 'Las Vegas', 'Nevada', 'United States',  36.1194,  -115.1708),
  ('Sahara Las Vegas',                  'seed', 'Las Vegas', 'Nevada', 'United States',  36.1422,  -115.1564),
  ('The Strat',                         'seed', 'Las Vegas', 'Nevada', 'United States',  36.1475,  -115.1567),
  ('The Palazzo',                       'seed', 'Las Vegas', 'Nevada', 'United States',  36.1244,  -115.1680),
  ('Hard Rock Las Vegas',               'seed', 'Las Vegas', 'Nevada', 'United States',  36.1211,  -115.1678),
  ('Rio All-Suite Hotel & Casino',      'seed', 'Las Vegas', 'Nevada', 'United States',  36.1169,  -115.1874),
  ('Palms Casino Resort',               'seed', 'Las Vegas', 'Nevada', 'United States',  36.1144,  -115.1950),
  ('South Point',                       'seed', 'Las Vegas', 'Nevada', 'United States',  36.0114,  -115.1750)
on conflict (lower(name)) do update set
  lat = excluded.lat,
  lng = excluded.lng,
  city = coalesce(public.casinos.city, excluded.city),
  state = coalesce(public.casinos.state, excluded.state),
  country = coalesce(public.casinos.country, excluded.country);
