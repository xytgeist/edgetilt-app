-- Fantasy insider news: NFL insiders / beat writers on X → player-matched breaking news for Fantasy Player news.
-- Edge `fantasy-insider-poll` reads `fantasy_insider_sources`, keeps one search cursor in `fantasy_insider_state`,
-- and writes `fantasy_insider_news` (status show / duplicate / skip). `fantasy-player-news` serves show rows.

create table if not exists public.fantasy_insider_sources (
  handle text primary key,
  display_name text not null default '',
  kind text not null check (kind in ('national', 'beat')),
  team text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.fantasy_insider_sources is
  'X accounts polled for fantasy breaking news. handle is the lowercase X username; team = beat team (or home team for a team-leaning insider).';

create table if not exists public.fantasy_insider_state (
  id text primary key,
  since_id text,
  last_polled_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.fantasy_insider_news (
  tweet_id text primary key,
  handle text not null,
  author_name text not null default '',
  posted_at timestamptz not null,
  text text not null,
  url text not null,
  sleeper_ids text[] not null default '{}',
  status text not null default 'show' check (status in ('show', 'duplicate', 'skip')),
  headline text not null default '',
  summary text not null default '',
  impact text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists fantasy_insider_news_posted_idx
  on public.fantasy_insider_news (posted_at desc);
create index if not exists fantasy_insider_news_sleeper_idx
  on public.fantasy_insider_news using gin (sleeper_ids);

comment on table public.fantasy_insider_news is
  'Player-matched insider posts with an LLM headline / summary / Fantasy Impact. duplicate = repeat of an earlier item; skip = not fantasy news.';

alter table public.fantasy_insider_sources enable row level security;
alter table public.fantasy_insider_state enable row level security;
alter table public.fantasy_insider_news enable row level security;

drop policy if exists "Service all fantasy_insider_sources" on public.fantasy_insider_sources;
create policy "Service all fantasy_insider_sources" on public.fantasy_insider_sources
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Service all fantasy_insider_state" on public.fantasy_insider_state;
create policy "Service all fantasy_insider_state" on public.fantasy_insider_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Service all fantasy_insider_news" on public.fantasy_insider_news;
create policy "Service all fantasy_insider_news" on public.fantasy_insider_news
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Authenticated read shown fantasy_insider_news" on public.fantasy_insider_news;
create policy "Authenticated read shown fantasy_insider_news" on public.fantasy_insider_news
  for select to authenticated using (status = 'show');

grant select on public.fantasy_insider_news to authenticated;
grant all on public.fantasy_insider_sources, public.fantasy_insider_state, public.fantasy_insider_news to service_role;

insert into public.fantasy_insider_state (id) values ('poll') on conflict (id) do nothing;

insert into public.fantasy_insider_sources (handle, display_name, kind, team) values
  ('adamschefter', 'Adam Schefter', 'national', null),
  ('rapsheet', 'Ian Rapoport', 'national', null),
  ('mikegarafolo', 'Mike Garafolo', 'national', null),
  ('tompelissero', 'Tom Pelissero', 'national', null),
  ('jfowlerespn', 'Jeremy Fowler', 'national', null),
  ('aaronwilson_nfl', 'Aaron Wilson', 'national', 'HOU'),
  ('albertbreer', 'Albert Breer', 'national', null),
  ('jayglazer', 'Jay Glazer', 'national', null),
  ('fieldyates', 'Field Yates', 'national', null),
  ('profootballtalk', 'ProFootballTalk', 'national', null),
  ('underdognfl', 'Underdog NFL', 'national', null),
  ('allbrightnfl', 'Benjamin Allbright', 'national', 'DEN'),
  ('charlesrobinson', 'Charles Robinson', 'national', null),
  ('josinaanderson', 'Josina Anderson', 'national', null),
  ('mikesilver', 'Michael Silver', 'national', null),
  ('mysportsupdate', 'Ari Meirov', 'national', null),
  ('schultz_report', 'Jordan Schultz', 'national', null),
  ('dangrazianoespn', 'Dan Graziano', 'national', null),
  ('jasonlacanfora', 'Jason La Canfora', 'national', null),
  ('cameronwolfe', 'Cameron Wolfe', 'national', null),
  ('jamespalmertv', 'James Palmer', 'national', null),
  ('jeffdarlington', 'Jeff Darlington', 'national', null),
  ('caplannfl', 'Adam Caplan', 'national', null),
  ('joshweinfuss', 'Josh Weinfuss', 'beat', 'ARI'),
  ('marcraimondi', 'Marc Raimondi', 'beat', 'ATL'),
  ('jamisonhensley', 'Jamison Hensley', 'beat', 'BAL'),
  ('agetzenberg', 'Alaina Getzenberg', 'beat', 'BUF'),
  ('josephperson', 'Joe Person', 'beat', 'CAR'),
  ('courtneyrcronin', 'Courtney Cronin', 'beat', 'CHI'),
  ('ben_baby', 'Ben Baby', 'beat', 'CIN'),
  ('marykaycabot', 'Mary Kay Cabot', 'beat', 'CLE'),
  ('toddarcher', 'Todd Archer', 'beat', 'DAL'),
  ('robdemovsky', 'Rob Demovsky', 'beat', 'GB'),
  ('holderstephen', 'Stephen Holder', 'beat', 'IND'),
  ('espndirocco', 'Michael DiRocco', 'beat', 'JAX'),
  ('adamteicher', 'Adam Teicher', 'beat', 'KC'),
  ('ryanmcfadden_', 'Ryan McFadden', 'beat', 'LV'),
  ('sarahbarshop', 'Sarah Barshop', 'beat', 'LAR'),
  ('marcel_lj', 'Marcel Louis-Jacques', 'beat', 'MIA'),
  ('seifertespn', 'Kevin Seifert', 'beat', 'MIN'),
  ('mikereiss', 'Mike Reiss', 'beat', 'NE'),
  ('kat_terrell', 'Katherine Terrell', 'beat', 'NO'),
  ('jordanraanan', 'Jordan Raanan', 'beat', 'NYG'),
  ('richcimini', 'Rich Cimini', 'beat', 'NYJ'),
  ('tim_mcmanus', 'Tim McManus', 'beat', 'PHI'),
  ('nwagoner', 'Nick Wagoner', 'beat', 'SF'),
  ('bradyhenderson', 'Brady Henderson', 'beat', 'SEA'),
  ('jennalaineespn', 'Jenna Laine', 'beat', 'TB'),
  ('tdavenport_nfl', 'Turron Davenport', 'beat', 'TEN'),
  ('john_keim', 'John Keim', 'beat', 'WAS')
on conflict (handle) do update set display_name = excluded.display_name, kind = excluded.kind, team = excluded.team;

-- Cron: every 2 minutes. The Edge decides whether this tick polls (game windows every tick, day 10 min, night 30 min).
create or replace function public.invoke_fantasy_insider_poll()
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  service_key text;
  base_url text;
  req_id bigint;
begin
  select btrim(ds.decrypted_secret) into service_key
  from vault.decrypted_secrets as ds where ds.name = 'lounge_odds_poll_service_role_key' limit 1;
  select btrim(ds.decrypted_secret) into base_url
  from vault.decrypted_secrets as ds where ds.name = 'lounge_odds_poll_project_url' limit 1;

  if service_key is null or service_key = '' or base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_fantasy_insider_poll: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-insider-poll',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_insider_poll: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_insider_poll() from public;
grant execute on function public.invoke_fantasy_insider_poll() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_insider_poll'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule('fantasy_insider_poll', '*/2 * * * *', $$select public.invoke_fantasy_insider_poll();$$);
