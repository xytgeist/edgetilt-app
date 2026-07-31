alter table public.app_section_visits
  add constraint app_section_visits_section_id_check check (
    section_id in (
      'lounge',
      'chat',
      'slots-hub',
      'poker-hub',
      'guides',
      'calculators',
      'bankroll',
      'play-logbook',
      'offers',
      'poker-bankroll',
      'poker-stable',
      'affiliates',
      'creator'
    )
  );
