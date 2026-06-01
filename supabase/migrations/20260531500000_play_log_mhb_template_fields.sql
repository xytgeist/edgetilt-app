-- Play Logbook — Must Hit By template: manufacturer, MHB meter, must-hit-by cap (not link-game counters).

insert into public.play_log_metric_defs (slug, label, value_type, sort_order) values
  ('mhb_manufacturer', 'Manufacturer', 'text',  15),
  ('mhb_meter',        'MHB meter',    'money', 16),
  ('must_hit_by',      'Must hit by',  'money', 17)
on conflict (slug) do update set
  label = excluded.label,
  value_type = excluded.value_type,
  sort_order = excluded.sort_order;

update public.play_log_game_templates t
set
  metric_slugs = array[
    'mhb_manufacturer',
    'mhb_meter',
    'must_hit_by',
    'bet_size',
    'denom',
    'spin_count',
    'bonus_count',
    'money_in',
    'money_out',
    'expected_ev_usd'
  ]::text[],
  updated_at = now()
where t.is_system = true
  and t.slug = 'must-hit-by';
