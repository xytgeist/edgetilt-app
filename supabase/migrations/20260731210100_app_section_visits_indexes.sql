create index if not exists app_section_visits_section_visited_idx
  on public.app_section_visits (section_id, visited_at desc);
