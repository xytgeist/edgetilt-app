-- Per-template user-defined metrics (name + value_type); slugs also listed in metric_slugs.

alter table public.play_log_game_templates
  add column if not exists custom_metric_defs jsonb not null default '[]'::jsonb;

comment on column public.play_log_game_templates.custom_metric_defs is
  'Array of {slug, label, value_type} for fields created in the template builder (not in play_log_metric_defs).';
