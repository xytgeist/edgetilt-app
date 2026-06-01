-- Play Logbook — spins/bonuses field labels always show as optional in the UI.

update public.play_log_metric_defs
set label = '# Spins (optional)'
where slug = 'spin_count';

update public.play_log_metric_defs
set label = '# Bonuses (optional)'
where slug = 'bonus_count';
