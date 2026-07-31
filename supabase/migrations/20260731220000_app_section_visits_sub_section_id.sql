alter table public.app_section_visits
  add column if not exists sub_section_id text;
