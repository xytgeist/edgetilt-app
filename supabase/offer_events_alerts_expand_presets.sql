-- Expand alert_preset options for timed reminders.
do $$
declare
  c_name text;
begin
  select con.conname
    into c_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'offer_events'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%alert_preset%';

  if c_name is not null then
    execute format('alter table public.offer_events drop constraint %I', c_name);
  end if;
end $$;

alter table public.offer_events
  add constraint offer_events_alert_preset_check
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
