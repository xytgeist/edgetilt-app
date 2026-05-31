-- Play Logbook — snapshot Current EV + Average Case from calculators at log time.

insert into public.play_log_metric_defs (slug, label, value_type, sort_order) values
  ('current_ev_rtp',    'Current EV (RTP %)',     'decimal', 145),
  ('average_case_mult', 'Average case (×)',     'decimal', 146),
  ('average_case_usd',  'Average case ($)',     'money',   147),
  ('expected_ev_usd',   'Expected EV ($)',      'money',   148)
on conflict (slug) do update set
  label = excluded.label,
  value_type = excluded.value_type,
  sort_order = excluded.sort_order;

update public.play_log_game_templates t
set
  metric_slugs = array(
    select distinct unnest(
      coalesce(t.metric_slugs, '{}'::text[])
      || array['current_ev_rtp','average_case_mult','average_case_usd']::text[]
    )
  ),
  updated_at = now()
where t.is_system = true
  and t.calculator_slug in ('phoenix', 'buffalo', 'stackup');

update public.play_log_game_templates t
set
  metric_slugs = array(
    select distinct unnest(
      coalesce(t.metric_slugs, '{}'::text[])
      || array['expected_ev_usd']::text[]
    )
  ),
  updated_at = now()
where t.is_system = true
  and t.calculator_slug = 'mhb';
