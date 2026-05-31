-- Log Play display labels for money_in / money_out (slugs unchanged).

update public.play_log_metric_defs
set label = 'Cash in'
where slug = 'money_in';

update public.play_log_metric_defs
set label = 'Cash out'
where slug = 'money_out';
