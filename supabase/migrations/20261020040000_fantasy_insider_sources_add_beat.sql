-- Beat writers that passed the same sample test as the original list (2026-10-19): 30 recent original posts,
-- fantasy news share whose 95% Wilson lower bound clears 20%.
insert into public.fantasy_insider_sources (handle, display_name, kind, team) values
  ('bynatetaylor', 'Nate Taylor', 'beat', 'KC'),
  ('mattderrick', 'Matt Derrick', 'beat', 'KC'),
  ('davebirkett', 'Dave Birkett', 'beat', 'DET'),
  ('levidamien', 'Levi Damien', 'beat', 'LV')
on conflict (handle) do update set display_name = excluded.display_name, kind = excluded.kind, team = excluded.team, active = true;
