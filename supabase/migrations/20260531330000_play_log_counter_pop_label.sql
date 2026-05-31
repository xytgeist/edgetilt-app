-- Log Play + metric def display label for counter_at_hit (slug unchanged).

update public.play_log_metric_defs
set label = 'Counter Pop'
where slug = 'counter_at_hit';
