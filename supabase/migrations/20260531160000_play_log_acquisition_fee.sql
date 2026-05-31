-- Play Logbook — acquisition fee (recommended finder's fee snapshot from calculators).

insert into public.play_log_metric_defs (slug, label, value_type, sort_order) values
  ('acquisition_fee', 'Acquisition fee', 'money', 149)
on conflict (slug) do update set
  label = excluded.label,
  value_type = excluded.value_type,
  sort_order = excluded.sort_order;

update public.play_log_game_templates t
set
  metric_slugs = array(
    select distinct unnest(
      coalesce(t.metric_slugs, '{}'::text[]) || array['acquisition_fee']::text[]
    )
  ),
  updated_at = now()
where t.is_system = true
  and t.calculator_slug in ('phoenix', 'buffalo', 'stackup');
