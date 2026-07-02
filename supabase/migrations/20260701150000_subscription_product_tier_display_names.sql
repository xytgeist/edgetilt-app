-- Public tier display names: Slots Edge, Slots Edge Pro, Slots Edge Lifetime (slugs unchanged).

update public.subscription_products
set
  display_name = 'Slots Edge',
  description = 'Starter guide pack plus weekly premium guide drops.',
  updated_at = now()
where slug = 'slots-edge-starter';

update public.subscription_products
set
  display_name = 'Slots Edge Pro',
  description = 'Full AP guide library, all calculators, bankroll, logbook, and calendar OCR.',
  updated_at = now()
where slug = 'slots-edge';

update public.subscription_products
set
  display_name = 'Slots Edge Lifetime',
  updated_at = now()
where slug = 'slots-edge-lifetime';
