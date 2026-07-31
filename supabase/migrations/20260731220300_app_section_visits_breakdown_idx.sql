create index if not exists app_section_visits_breakdown_idx
  on public.app_section_visits (section_id, event_kind, sub_section_id, visited_at desc);
