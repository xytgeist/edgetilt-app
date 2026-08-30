-- ============================================================================
-- cfb_team_power_ratings: College Football (NCAAF) Power Index, Off/Def Ratings & Home Field Advantage
-- Mirrors NFL Team Metrics structure to give College Football true model spreads,
-- SP+ / FPI / EPA ratings, and conference tiering for Scott & Rocco syndicate models.
-- ============================================================================

do $$
begin
  -- 1. Create cfb_team_power_ratings table
  create table if not exists public.cfb_team_power_ratings (
    id uuid default gen_random_uuid() primary key,
    team_name text not null unique,
    team_abbr text not null,
    conference text not null, -- SEC, Big Ten, Big 12, ACC, Notre Dame/Ind, Group of 5
    power_rating numeric not null default 0.0, -- Points vs Average FBS team (e.g. Georgia +28.5, Ohio St +28.0)
    off_rating numeric not null default 0.0,   -- Offensive efficiency rating (points above avg)
    def_rating numeric not null default 0.0,   -- Defensive efficiency rating (points prevented below avg)
    tempo_rating numeric not null default 68.0, -- Plays per game / pace factor
    home_field_advantage numeric not null default 3.0, -- Stadium specific HFA (e.g. LSU/Penn State 3.8, neutral 0.0)
    is_custom_override boolean not null default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  -- 2. Enable RLS
  alter table public.cfb_team_power_ratings enable row level security;

  -- 3. Public read policy
  drop policy if exists "Public read cfb_team_power_ratings" on public.cfb_team_power_ratings;
  create policy "Public read cfb_team_power_ratings"
    on public.cfb_team_power_ratings
    for select
    using (true);

  -- 4. Staff & Service role manage policy
  drop policy if exists "Staff and service manage cfb_team_power_ratings" on public.cfb_team_power_ratings;
  create policy "Staff and service manage cfb_team_power_ratings"
    on public.cfb_team_power_ratings
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  -- 5. Seed initial baseline ratings for Top Power Programs & Key FBS Teams
  insert into public.cfb_team_power_ratings (team_name, team_abbr, conference, power_rating, off_rating, def_rating, tempo_rating, home_field_advantage)
  values
    -- SEC
    ('Georgia Bulldogs', 'UGA', 'SEC', 28.5, 41.5, 13.0, 67.5, 3.5),
    ('Texas Longhorns', 'TEX', 'SEC', 28.0, 42.0, 14.0, 69.0, 3.5),
    ('Alabama Crimson Tide', 'ALA', 'SEC', 26.5, 39.5, 13.0, 68.5, 3.8),
    ('Ole Miss Rebels', 'MISS', 'SEC', 24.5, 43.0, 18.5, 74.0, 3.0),
    ('LSU Tigers', 'LSU', 'SEC', 22.0, 40.0, 18.0, 69.5, 4.0),
    ('Tennessee Volunteers', 'TENN', 'SEC', 23.5, 38.5, 15.0, 72.5, 3.8),
    ('Texas A&M Aggies', 'TAMU', 'SEC', 21.0, 35.0, 14.0, 68.0, 3.8),
    ('Missouri Tigers', 'MIZZ', 'SEC', 20.5, 36.5, 16.0, 67.0, 3.0),
    ('Oklahoma Sooners', 'OU', 'SEC', 19.5, 33.5, 14.0, 68.0, 3.5),
    ('Kentucky Wildcats', 'UK', 'SEC', 14.0, 27.5, 13.5, 63.5, 2.8),
    ('Auburn Tigers', 'AUB', 'SEC', 15.5, 31.0, 15.5, 69.0, 3.5),
    ('Florida Gators', 'FLA', 'SEC', 14.5, 30.5, 16.0, 68.0, 3.5),
    ('South Carolina Gamecocks', 'SC', 'SEC', 13.5, 26.0, 12.5, 67.0, 3.2),
    ('Arkansas Razorbacks', 'ARK', 'SEC', 12.0, 30.0, 18.0, 68.5, 2.8),
    ('Mississippi State Bulldogs', 'MSST', 'SEC', 7.5, 27.0, 19.5, 69.0, 3.0),
    ('Vanderbilt Commodores', 'VAN', 'SEC', 6.0, 24.5, 18.5, 65.0, 2.0),

    -- BIG TEN
    ('Ohio State Buckeyes', 'OSU', 'Big Ten', 28.5, 42.0, 13.5, 67.0, 3.8),
    ('Oregon Ducks', 'ORE', 'Big Ten', 27.5, 43.5, 16.0, 71.0, 3.8),
    ('Penn State Nittany Lions', 'PSU', 'Big Ten', 25.0, 38.0, 13.0, 68.0, 4.0),
    ('Michigan Wolverines', 'MICH', 'Big Ten', 20.0, 31.5, 11.5, 64.0, 3.8),
    ('USC Trojans', 'USC', 'Big Ten', 19.0, 39.0, 20.0, 71.5, 2.8),
    ('Iowa Hawkeyes', 'IOWA', 'Big Ten', 15.0, 23.0, 8.0, 62.0, 3.5),
    ('Washington Huskies', 'WASH', 'Big Ten', 14.5, 31.0, 16.5, 68.0, 3.5),
    ('Wisconsin Badgers', 'WIS', 'Big Ten', 13.0, 28.0, 15.0, 66.0, 3.2),
    ('Nebraska Cornhuskers', 'NEB', 'Big Ten', 13.5, 27.5, 14.0, 66.5, 3.5),
    ('Indiana Hoosiers', 'IND', 'Big Ten', 17.5, 37.0, 19.5, 70.0, 2.5),
    ('Illinois Fighting Illini', 'ILL', 'Big Ten', 14.0, 29.5, 15.5, 67.0, 2.8),
    ('Rutgers Scarlet Knights', 'RUT', 'Big Ten', 10.5, 26.0, 15.5, 66.0, 2.5),
    ('Minnesota Golden Gophers', 'MINN', 'Big Ten', 11.0, 25.5, 14.5, 65.0, 2.8),
    ('Maryland Terrapins', 'MD', 'Big Ten', 10.0, 29.0, 19.0, 68.0, 2.5),
    ('Michigan State Spartans', 'MSU', 'Big Ten', 9.0, 25.0, 16.0, 67.0, 3.0),
    ('UCLA Bruins', 'UCLA', 'Big Ten', 7.0, 24.5, 17.5, 66.0, 2.2),
    ('Northwestern Wildcats', 'NW', 'Big Ten', 4.5, 20.5, 16.0, 64.0, 2.0),
    ('Purdue Boilermakers', 'PUR', 'Big Ten', 3.0, 22.0, 19.0, 67.0, 2.5),

    -- BIG 12
    ('Utah Utes', 'UTAH', 'Big 12', 20.5, 33.5, 13.0, 67.0, 3.8),
    ('Kansas State Wildcats', 'KSU', 'Big 12', 19.0, 34.5, 15.5, 67.5, 3.2),
    ('Iowa State Cyclones', 'ISU', 'Big 12', 18.0, 31.5, 13.5, 66.0, 3.2),
    ('Oklahoma State Cowboys', 'OKST', 'Big 12', 17.0, 34.0, 17.0, 68.5, 3.0),
    ('Arizona Wildcats', 'ARIZ', 'Big 12', 16.5, 35.5, 19.0, 69.0, 3.0),
    ('Colorado Buffaloes', 'COLO', 'Big 12', 15.5, 37.0, 21.5, 71.0, 3.2),
    ('Texas Tech Red Raiders', 'TTU', 'Big 12', 14.0, 36.5, 22.5, 75.0, 3.2),
    ('TCU Horned Frogs', 'TCU', 'Big 12', 13.5, 34.0, 20.5, 72.0, 2.8),
    ('West Virginia Mountaineers', 'WVU', 'Big 12', 13.0, 31.5, 18.5, 67.5, 3.2),
    ('Kansas Jayhawks', 'KU', 'Big 12', 13.0, 32.5, 19.5, 66.5, 2.5),
    ('BYU Cougars', 'BYU', 'Big 12', 15.0, 30.0, 15.0, 67.0, 3.5),
    ('Baylor Bears', 'BAY', 'Big 12', 11.0, 29.5, 18.5, 68.0, 2.8),
    ('UCF Knights', 'UCF', 'Big 12', 12.5, 33.0, 20.5, 70.0, 3.0),
    ('Arizona State Sun Devils', 'ASU', 'Big 12', 12.0, 28.5, 16.5, 67.0, 3.0),
    ('Cincinnati Bearcats', 'CIN', 'Big 12', 9.5, 27.5, 18.0, 67.5, 2.8),
    ('Houston Cougars', 'HOU', 'Big 12', 5.0, 21.0, 16.0, 65.5, 2.5),

    -- ACC
    ('Miami Hurricanes', 'MIA', 'ACC', 22.5, 41.0, 18.5, 70.0, 3.0),
    ('Clemson Tigers', 'CLEM', 'ACC', 22.0, 36.5, 14.5, 69.5, 3.8),
    ('Louisville Cardinals', 'LOU', 'ACC', 19.0, 36.0, 17.0, 68.5, 3.0),
    ('SMU Mustangs', 'SMU', 'ACC', 17.5, 37.0, 19.5, 71.0, 2.8),
    ('Florida State Seminoles', 'FSU', 'ACC', 14.5, 27.0, 12.5, 67.0, 3.5),
    ('Virginia Tech Hokies', 'VT', 'ACC', 14.0, 29.5, 15.5, 66.0, 3.8),
    ('NC State Wolfpack', 'NCST', 'ACC', 13.5, 28.5, 15.0, 67.0, 3.2),
    ('Pittsburgh Panthers', 'PITT', 'ACC', 14.0, 33.5, 19.5, 72.0, 2.8),
    ('Georgia Tech Yellow Jackets', 'GT', 'ACC', 13.0, 31.0, 18.0, 67.5, 2.5),
    ('North Carolina Tar Heels', 'UNC', 'ACC', 12.0, 32.5, 20.5, 70.0, 2.8),
    ('California Golden Bears', 'CAL', 'ACC', 11.0, 26.5, 15.5, 68.0, 2.5),
    ('Boston College Eagles', 'BC', 'ACC', 10.5, 27.0, 16.5, 66.0, 2.5),
    ('Duke Blue Devils', 'DUKE', 'ACC', 11.5, 26.0, 14.5, 67.0, 2.2),
    ('Virginia Cavaliers', 'UVA', 'ACC', 8.5, 26.5, 18.0, 68.0, 2.5),
    ('Syracuse Orange', 'SYR', 'ACC', 10.0, 30.5, 20.5, 71.0, 2.5),
    ('Wake Forest Demon Deacons', 'WAKE', 'ACC', 6.0, 24.5, 18.5, 70.0, 2.2),
    ('Stanford Cardinal', 'STAN', 'ACC', 5.0, 23.0, 18.0, 66.0, 2.0),

    -- NOTRE DAME / INDEPENDENTS
    ('Notre Dame Fighting Irish', 'ND', 'Independent', 25.5, 38.5, 13.0, 68.0, 3.5),

    -- GROUP OF 5 POWER / SERVICE ACADEMIES
    ('Boise State Broncos', 'BSU', 'Mountain West', 18.5, 37.0, 18.5, 68.5, 3.8),
    ('Memphis Tigers', 'MEM', 'AAC', 13.5, 34.5, 21.0, 70.0, 3.0),
    ('Tulane Green Wave', 'TUL', 'AAC', 13.0, 31.5, 18.5, 67.0, 2.8),
    ('Liberty Flames', 'LIB', 'C-USA', 12.0, 33.0, 21.0, 69.0, 2.8),
    ('Appalachian State Mountaineers', 'APP', 'Sun Belt', 10.5, 31.0, 20.5, 70.0, 3.5),
    ('James Madison Dukes', 'JMU', 'Sun Belt', 11.5, 30.5, 19.0, 68.5, 3.2),
    ('UNLV Rebels', 'UNLV', 'Mountain West', 12.5, 33.5, 21.0, 69.5, 2.5),
    ('Fresno State Bulldogs', 'FRES', 'Mountain West', 9.5, 28.0, 18.5, 67.0, 3.0),
    ('Army Black Knights', 'ARMY', 'AAC', 11.0, 26.0, 15.0, 61.0, 3.0),
    ('Navy Midshipmen', 'NAVY', 'AAC', 9.0, 25.0, 16.0, 61.5, 3.0),
    ('Air Force Falcons', 'AFA', 'Mountain West', 6.5, 22.5, 16.0, 60.5, 3.5)
  on conflict (team_name) do update set
    power_rating = excluded.power_rating,
    off_rating = excluded.off_rating,
    def_rating = excluded.def_rating,
    tempo_rating = excluded.tempo_rating,
    home_field_advantage = excluded.home_field_advantage;

  -- 6. Seed initial baseline factor weights for Scott & Rocco in lounge_bot_persona_weights
  insert into public.lounge_bot_persona_weights (picker_name, factor_key, prior_weight, calibrated_weight)
  values
    ('Scott', 'cfb_power_index_value', 1.0, 1.0),
    ('Rocco', 'cfb_power_index_value', 1.0, 1.0)
  on conflict (picker_name, factor_key) do nothing;
end $$;
