insert into public.app_product_analytics_excluded_emails (email, note)
values ('chunky.unc@gmail.com', 'Ryan test account (@chunkyunc)')
on conflict (email) do update set note = excluded.note;

delete from public.app_section_visits v
using public.profiles p
join auth.users u on u.id = p.user_id
where v.user_id = p.user_id
  and lower(u.email) = 'chunky.unc@gmail.com';
