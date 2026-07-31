insert into public.app_product_analytics_excluded_emails (email, note) values
  ('bryanfranzen16@gmail.com', 'Ryan test account'),
  ('chunkyunc@gmail.com', 'Ryan test account (@qb13)'),
  ('chunky.unc@gmail.com', 'Ryan test account (@chunkyunc)'),
  ('deanofpoker@gmail.com', 'Ryan test account'),
  ('etceterama@gmail.com', 'Ryan test account'),
  ('franklinvest@gmail.com', 'Ryan test account'),
  ('hello@sportportactive.com', 'Ryan test account'),
  ('operations@lvslotpro.com', 'Ryan ops account'),
  ('reachselena@gmail.com', 'Ryan test account'),
  ('xytgeist@gmail.com', 'Ryan primary account')
on conflict (email) do update set note = excluded.note;
