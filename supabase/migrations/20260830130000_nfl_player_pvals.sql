-- ============================================================================
-- nfl_player_pvals table & PVAL Management
-- Stores baseline and custom overridden Point Spread Values (PVAL) for NFL players.
-- Allows weekly automated sync and admin portal manual overrides.
-- ============================================================================

do $$
begin
  -- 1. Create table nfl_player_pvals
  create table if not exists public.nfl_player_pvals (
    id uuid primary key default gen_random_uuid(),
    player_name text not null,
    normalized_name text not null,
    team_name text not null,
    position text not null, -- 'QB', 'EDGE', 'OT', 'CB', 'WR', 'DT', 'S', 'RB', 'TE'
    side text not null default 'offense', -- 'offense' | 'defense'
    pval numeric not null default 0.0,
    tier integer default 2,
    notes text,
    is_custom_override boolean not null default false,
    last_synced_at timestamptz default now(),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    constraint nfl_player_pvals_normalized_name_unique unique (normalized_name)
  );

  -- 2. Index for quick lookups
  create index if not exists idx_nfl_player_pvals_normalized_name on public.nfl_player_pvals(normalized_name);
  create index if not exists idx_nfl_player_pvals_position on public.nfl_player_pvals(position);
  create index if not exists idx_nfl_player_pvals_team on public.nfl_player_pvals(team_name);

  -- 3. Enable RLS
  alter table public.nfl_player_pvals enable row level security;

  -- 4. Public read policy
  drop policy if exists "Public read nfl_player_pvals" on public.nfl_player_pvals;
  create policy "Public read nfl_player_pvals"
    on public.nfl_player_pvals
    for select
    using (true);

  -- 5. Staff / Service role manage policy
  drop policy if exists "Staff manage nfl_player_pvals" on public.nfl_player_pvals;
  create policy "Staff manage nfl_player_pvals"
    on public.nfl_player_pvals
    for all
    using (
      auth.role() = 'service_role' or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role' or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  -- 6. Seed default top players into nfl_player_pvals
  insert into public.nfl_player_pvals (player_name, normalized_name, team_name, position, side, pval, tier, notes)
  values
    ('Patrick Mahomes', 'patrickmahomes', 'Kansas City Chiefs', 'QB', 'offense', 6.0, 1, 'Tier 1 Elite QB'),
    ('Josh Allen', 'joshallen', 'Buffalo Bills', 'QB', 'offense', 5.5, 1, 'Tier 1 Elite QB'),
    ('Lamar Jackson', 'lamarjackson', 'Baltimore Ravens', 'QB', 'offense', 5.5, 1, 'Tier 1 Elite Dual-Threat'),
    ('Joe Burrow', 'joeburrow', 'Cincinnati Bengals', 'QB', 'offense', 5.0, 1, 'Tier 1 Elite Pocket Passer'),
    ('C.J. Stroud', 'cjstroud', 'Houston Texans', 'QB', 'offense', 4.5, 1, 'Tier 1 Elite QB'),
    ('Brock Purdy', 'brockpurdy', 'San Francisco 49ers', 'QB', 'offense', 4.0, 2, 'Tier 2 System Master'),
    ('Dak Prescott', 'dakprescott', 'Dallas Cowboys', 'QB', 'offense', 4.0, 2, 'Tier 2 Starter'),
    ('Justin Herbert', 'justinherbert', 'Los Angeles Chargers', 'QB', 'offense', 4.0, 2, 'Tier 2 Elite Arm'),
    ('Jalen Hurts', 'jalenhurts', 'Philadelphia Eagles', 'QB', 'offense', 4.0, 2, 'Tier 2 Dual-Threat'),
    ('Jared Goff', 'jaredgoff', 'Detroit Lions', 'QB', 'offense', 3.5, 2, 'Tier 2 Pocket Passer'),
    ('Jordan Love', 'jordanlove', 'Green Bay Packers', 'QB', 'offense', 3.5, 2, 'Tier 2 Starter'),
    ('Matthew Stafford', 'matthewstafford', 'Los Angeles Rams', 'QB', 'offense', 3.5, 2, 'Tier 2 Veteran'),
    ('Kyler Murray', 'kylermurray', 'Arizona Cardinals', 'QB', 'offense', 3.5, 2, 'Tier 2 Dual-Threat'),
    ('Aaron Rodgers', 'aaronrodgers', 'New York Jets', 'QB', 'offense', 3.5, 2, 'Tier 2 Veteran'),
    ('Tua Tagovailoa', 'tuatagovailoa', 'Miami Dolphins', 'QB', 'offense', 3.5, 2, 'Tier 2 Quick Release'),
    ('Kirk Cousins', 'kirkcousins', 'Atlanta Falcons', 'QB', 'offense', 3.0, 2, 'Tier 2 Veteran'),
    ('Baker Mayfield', 'bakermayfield', 'Tampa Bay Buccaneers', 'QB', 'offense', 3.0, 2, 'Tier 2 Starter'),
    ('Trevor Lawrence', 'trevorlawrence', 'Jacksonville Jaguars', 'QB', 'offense', 3.0, 2, 'Tier 2 Starter'),
    ('Jayden Daniels', 'jaydendaniels', 'Washington Commanders', 'QB', 'offense', 3.0, 2, 'Tier 2 Breakout Rookie'),
    ('Caleb Williams', 'calebwilliams', 'Chicago Bears', 'QB', 'offense', 2.5, 3, 'Tier 3 Rookie'),
    ('Geno Smith', 'genosmith', 'Seattle Seahawks', 'QB', 'offense', 2.5, 3, 'Tier 3 Bridge'),
    ('Sam Darnold', 'samdarnold', 'Minnesota Vikings', 'QB', 'offense', 2.0, 3, 'Tier 3 Bridge'),
    ('Derek Carr', 'derekcarr', 'New Orleans Saints', 'QB', 'offense', 2.0, 3, 'Tier 3 Veteran'),
    ('Russell Wilson', 'russellwilson', 'Pittsburgh Steelers', 'QB', 'offense', 2.0, 3, 'Tier 3 Veteran'),
    ('Justin Fields', 'justinfields', 'Pittsburgh Steelers', 'QB', 'offense', 2.0, 3, 'Tier 3 Dual-Threat'),
    ('Deshaun Watson', 'deshaunwatson', 'Cleveland Browns', 'QB', 'offense', 1.5, 3, 'Tier 3 Struggling'),
    ('Daniel Jones', 'danieljones', 'New York Giants', 'QB', 'offense', 1.5, 3, 'Tier 3 Bridge'),
    ('Gardner Minshew', 'gardnerminshew', 'Las Vegas Raiders', 'QB', 'offense', 1.5, 3, 'Tier 3 Bridge'),
    ('Bo Nix', 'bonix', 'Denver Broncos', 'QB', 'offense', 1.5, 3, 'Tier 3 Rookie'),
    ('Will Levis', 'willlevis', 'Tennessee Titans', 'QB', 'offense', 1.5, 3, 'Tier 3 Bridge'),
    ('Bryce Young', 'bryceyoung', 'Carolina Panthers', 'QB', 'offense', 1.5, 3, 'Tier 3 Bridge'),
    ('Drake Maye', 'drakemaye', 'New England Patriots', 'QB', 'offense', 1.5, 3, 'Tier 3 Rookie'),
    ('Jacoby Brissett', 'jacobybrissett', 'New England Patriots', 'QB', 'offense', 1.5, 3, 'Tier 3 Bridge'),
    ('Myles Garrett', 'mylesgarrett', 'Cleveland Browns', 'EDGE', 'defense', 1.5, 1, 'Elite DPOY Edge'),
    ('T.J. Watt', 'tjwatt', 'Pittsburgh Steelers', 'EDGE', 'defense', 1.5, 1, 'Elite DPOY Edge'),
    ('Micah Parsons', 'micahparsons', 'Dallas Cowboys', 'EDGE', 'defense', 1.5, 1, 'Elite DPOY Edge'),
    ('Nick Bosa', 'nickbosa', 'San Francisco 49ers', 'EDGE', 'defense', 1.25, 1, 'Elite Edge'),
    ('Maxx Crosby', 'maxxcrosby', 'Las Vegas Raiders', 'EDGE', 'defense', 1.25, 1, 'Elite Edge'),
    ('Aidan Hutchinson', 'aidanhutchinson', 'Detroit Lions', 'EDGE', 'defense', 1.25, 1, 'Elite Edge'),
    ('Chris Jones', 'chrisjones', 'Kansas City Chiefs', 'DT', 'defense', 1.25, 1, 'Elite Interior Rusher'),
    ('Dexter Lawrence', 'dexterlawrence', 'New York Giants', 'DT', 'defense', 1.0, 1, 'Elite Nose Tackle'),
    ('Sauce Gardner', 'saucegardner', 'New York Jets', 'CB', 'defense', 1.0, 1, 'Lockdown CB1'),
    ('Patrick Surtain', 'patricksurtain', 'Denver Broncos', 'CB', 'defense', 1.0, 1, 'Lockdown CB1'),
    ('Kyle Hamilton', 'kylehamilton', 'Baltimore Ravens', 'S', 'defense', 1.0, 1, 'All-Pro Safety'),
    ('Trent McDuffie', 'trentmcduffie', 'Kansas City Chiefs', 'CB', 'defense', 0.75, 2, 'All-Pro Slot/Outside CB'),
    ('Trent Williams', 'trentwilliams', 'San Francisco 49ers', 'OT', 'offense', 1.25, 1, 'All-Pro Left Tackle'),
    ('Penei Sewell', 'peneisewell', 'Detroit Lions', 'OT', 'offense', 1.0, 1, 'All-Pro Right Tackle'),
    ('Tristan Wirfs', 'tristanwirfs', 'Tampa Bay Buccaneers', 'OT', 'offense', 1.0, 1, 'All-Pro Tackle'),
    ('Lane Johnson', 'lanejohnson', 'Philadelphia Eagles', 'OT', 'offense', 1.0, 1, 'All-Pro Right Tackle'),
    ('Justin Jefferson', 'justinjefferson', 'Minnesota Vikings', 'WR', 'offense', 1.25, 1, 'All-Pro WR1 Alpha'),
    ('JaMarr Chase', 'jamarrchase', 'Cincinnati Bengals', 'WR', 'offense', 1.25, 1, 'All-Pro WR1 Alpha'),
    ('CeeDee Lamb', 'ceedeelamb', 'Dallas Cowboys', 'WR', 'offense', 1.25, 1, 'All-Pro WR1 Alpha'),
    ('Tyreek Hill', 'tyreekhill', 'Miami Dolphins', 'WR', 'offense', 1.25, 1, 'Elite Deep Threat WR1'),
    ('Amon-Ra St. Brown', 'amonrastbrown', 'Detroit Lions', 'WR', 'offense', 1.0, 1, 'All-Pro Slot WR1'),
    ('A.J. Brown', 'ajbrown', 'Philadelphia Eagles', 'WR', 'offense', 1.0, 1, 'All-Pro WR1 Physical Alpha'),
    ('Christian McCaffrey', 'christianmccaffrey', 'San Francisco 49ers', 'RB', 'offense', 0.75, 1, 'All-Pro Dual-Threat RB'),
    ('Derrick Henry', 'derrickhenry', 'Baltimore Ravens', 'RB', 'offense', 0.75, 1, 'Elite Power RB')
  on conflict (normalized_name) do update
  set
    player_name = excluded.player_name,
    team_name = excluded.team_name,
    position = excluded.position,
    side = excluded.side,
    pval = excluded.pval,
    tier = excluded.tier,
    notes = excluded.notes,
    updated_at = now()
  where nfl_player_pvals.is_custom_override = false;

end $$;
