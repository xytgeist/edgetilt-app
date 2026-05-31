-- Standard-field picker + metric def display label for counter (slug unchanged).

update public.play_log_metric_defs
set label = 'Counter Start'
where slug = 'counter';
