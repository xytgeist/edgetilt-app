create index if not exists app_section_visits_user_visited_idx
  on public.app_section_visits (user_id, visited_at desc);
