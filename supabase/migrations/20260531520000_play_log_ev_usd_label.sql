-- Play Logbook — rename expected_ev_usd display label; value lives on the form, not notes.

update public.play_log_metric_defs
set label = 'EV ($)'
where slug = 'expected_ev_usd';
