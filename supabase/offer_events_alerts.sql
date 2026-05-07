-- Per-event reminder schedule for offer push (see computeOfferAlertFireIso in app).
alter table public.offer_events
  add column if not exists alert_preset text not null default 'none'
  check (
    alert_preset in (
      'none',
      'day_9am',
      'at_time',
      '5_min_before',
      '10_min_before',
      '15_min_before',
      '30_min_before',
      'hour_before',
      '2_hours_before',
      '1_day_before',
      '2_days_before',
      '1_week_before'
    )
  );

alter table public.offer_events
  add column if not exists alert_fire_at timestamptz;

comment on column public.offer_events.alert_preset is 'none | day_9am | at_time | 5_min_before | 10_min_before | 15_min_before | 30_min_before | hour_before | 2_hours_before | 1_day_before | 2_days_before | 1_week_before';
comment on column public.offer_events.alert_fire_at is 'When to fire web push; null if alert_preset is none';
