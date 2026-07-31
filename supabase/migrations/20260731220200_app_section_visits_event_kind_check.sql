alter table public.app_section_visits
  add constraint app_section_visits_event_kind_check
  check (event_kind in ('visit', 'session_recorded'));
