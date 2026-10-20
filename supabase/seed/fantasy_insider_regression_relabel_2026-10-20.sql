-- insider-review 2026-10-20: "KaVontae Turpin has been ruled out with a rib injury." (@toddarcher) was posted 32 min into
-- DAL @ GB (in-game ruling after "questionable to return"), so the right read is no next-game status.
update public.fantasy_insider_regression
set expected_next = 'none', expected_player = null, note = 'in-game ruling (relabeled 2026-10-20)'
where handle = 'toddarcher' and text like 'KaVontae Turpin has been ruled out with a rib injury.%';

-- Same class, found once the in-game guard had post times: these "ruled out" posts went out while that player's game
-- was underway (rest-of-game rulings), so they set no next-game status.
update public.fantasy_insider_regression
set expected_next = 'none', expected_player = null, note = 'in-game ruling (relabeled 2026-10-20)'
where origin = 'seed-validated'
  and expected_player in ('Terry McLaurin', 'Mike Evans', 'Carson Steele')
  and expected_next = 'out'
  and text !~* '(next week|sunday|monday|thursday|weeks|season|injured reserve)';
