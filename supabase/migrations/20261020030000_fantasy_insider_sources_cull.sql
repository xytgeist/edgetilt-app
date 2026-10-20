-- Cull low-signal insider accounts after a 2,363-post sample (2026-10-19): under 20% fantasy news at 95% confidence,
-- or no posts in two weeks. Deactivated, not deleted, so the history stays readable.
update public.fantasy_insider_sources
set active = false
where handle in (
  'mikesilver', 'ryanmcfadden_', 'josinaanderson', 'albertbreer', 'marcel_lj', 'allbrightnfl',
  'charlesrobinson', 'jayglazer', 'jasonlacanfora', 'john_keim', 'adamteicher', 'agetzenberg'
);
