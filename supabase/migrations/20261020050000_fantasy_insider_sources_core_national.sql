-- National insiders trimmed to the core (Schefter, Rapoport, Pelissero, Garafolo) plus Underdog for speed and
-- Caplan (83% news, ~3 posts/day). PFT mostly re-posts the core's news; the rest add little news per dollar.
-- Team beat writers stay as they are.
update public.fantasy_insider_sources
set active = false
where kind = 'national'
  and handle in (
    'profootballtalk', 'jfowlerespn', 'fieldyates', 'mysportsupdate', 'schultz_report',
    'dangrazianoespn', 'cameronwolfe', 'jamespalmertv', 'jeffdarlington'
  );
