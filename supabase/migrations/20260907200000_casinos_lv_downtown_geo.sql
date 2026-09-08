-- Downtown Fremont GPS so Near you / GPS autofill can rank Circa, Plaza, The D,
-- Four Queens, and Golden Gate. Circa already exists as a nameless-geo
-- user_confirmed row; this upserts lat/lng onto that name.
-- Safe to re-run. Single statement (db:query -f OK).

insert into public.casinos (name, source, city, state, country, lat, lng, aliases)
values
  (
    'Circa',
    'seed',
    'Las Vegas',
    'Nevada',
    'United States',
    36.1714,
    -115.1436,
    array['Circa Resort & Casino', 'Circa Sports']
  ),
  (
    'Plaza Hotel & Casino',
    'seed',
    'Las Vegas',
    'Nevada',
    'United States',
    36.1716,
    -115.1467,
    array['The Plaza', 'Plaza Las Vegas']
  ),
  (
    'The D',
    'seed',
    'Las Vegas',
    'Nevada',
    'United States',
    36.1692,
    -115.1392,
    array['The D Las Vegas', 'The D Casino']
  ),
  (
    'Four Queens',
    'seed',
    'Las Vegas',
    'Nevada',
    'United States',
    36.1700,
    -115.1439,
    array['Four Queens Hotel & Casino']
  ),
  (
    'Golden Gate Hotel & Casino',
    'seed',
    'Las Vegas',
    'Nevada',
    'United States',
    36.1711,
    -115.1458,
    array['Golden Gate', 'Golden Gate Casino']
  )
on conflict (lower(name)) do update set
  lat = excluded.lat,
  lng = excluded.lng,
  city = coalesce(public.casinos.city, excluded.city),
  state = coalesce(public.casinos.state, excluded.state),
  country = coalesce(public.casinos.country, excluded.country),
  aliases = (
    select coalesce(array_agg(distinct a), '{}')
    from unnest(coalesce(public.casinos.aliases, '{}') || excluded.aliases) as a
    where a is not null and btrim(a) <> ''
  );
