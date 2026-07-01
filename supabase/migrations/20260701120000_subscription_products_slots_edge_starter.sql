-- Slots Edge Starter ($14/mo) — starter pack (release year <= 2019) + weekly guide drops.
insert into public.subscription_products (slug, display_name, description, active, sort_order)
values (
  'slots-edge-starter',
  'Slots Edge Starter',
  'Starter guide pack (2019 and older) plus weekly premium guide drops.',
  true,
  5
)
on conflict (slug) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  active = excluded.active,
  sort_order = excluded.sort_order;
