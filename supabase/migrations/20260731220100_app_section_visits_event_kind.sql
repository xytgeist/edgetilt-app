alter table public.app_section_visits
  add column if not exists event_kind text not null default 'visit';
