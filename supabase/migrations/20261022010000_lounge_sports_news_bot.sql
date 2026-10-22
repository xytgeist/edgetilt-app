-- Lounge NFL news bot (Jordan Pike): posts the biggest player / game news from the fantasy insider feed + ESPN
-- designations at Market Edge pace. Edge `lounge-sports-news-poll` scores candidates and publishes; this adds the
-- `sports_news` pipeline, the insider `kind` tag, the bot's own post log (dedupe + line-move follow-ups), and cron.

begin;

alter table public.lounge_bot_accounts
  drop constraint if exists lounge_bot_accounts_pipeline_check;
alter table public.lounge_bot_accounts
  add constraint lounge_bot_accounts_pipeline_check
  check (pipeline in ('odds_api', 'market_news', 'x', 'manual', 'farm', 'sports_news'));

alter table public.lounge_bot_accounts
  drop constraint if exists lounge_bot_accounts_review_mode_pipeline;
alter table public.lounge_bot_accounts
  add constraint lounge_bot_accounts_review_mode_pipeline
  check (
    (pipeline = 'x' and review_mode in ('editorial', 'automatic'))
    or (pipeline in ('odds_api', 'market_news', 'farm', 'sports_news') and review_mode = 'automatic')
    or (pipeline = 'manual' and review_mode = 'editorial')
  );

comment on constraint lounge_bot_accounts_review_mode_pipeline on public.lounge_bot_accounts is
  'X may be editorial (inbox) or automatic (publish on ingest). Odds/news/farm/sports_news stay automatic; manual stays editorial.';

alter table public.fantasy_insider_news
  add column if not exists kind text check (kind in ('status', 'transaction', 'in_game', 'role', 'other'));

comment on column public.fantasy_insider_news.kind is
  'LLM news type: status (upcoming-game availability), transaction (trade / sign / release), in_game (injury during a game), role (starter / depth change), other. Null on rows before 2026-10-22.';

create table if not exists public.lounge_sports_news_posts (
  id uuid primary key default gen_random_uuid(),
  bot_user_id uuid not null references public.lounge_bot_accounts (user_id) on delete cascade,
  lane text not null check (lane in ('status', 'qb', 'in_game', 'transaction', 'inactives', 'line_move')),
  dedupe_key text not null unique,
  tweet_id text,
  sleeper_id text,
  team text,
  event_id text,
  score numeric,
  pill boolean not null default false,
  spread_home_at_post numeric,
  line_followed_at timestamptz,
  post_id uuid references public.community_feed_posts (id) on delete set null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists lounge_sports_news_posts_bot_created_idx
  on public.lounge_sports_news_posts (bot_user_id, created_at desc);

comment on table public.lounge_sports_news_posts is
  'Posts by the sports_news bot: dedupe keys, whether a game pill was attached, and the spread at post time so a later poll can follow up when the line moves.';

alter table public.lounge_sports_news_posts enable row level security;
drop policy if exists "Service all lounge_sports_news_posts" on public.lounge_sports_news_posts;
create policy "Service all lounge_sports_news_posts" on public.lounge_sports_news_posts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
grant all on public.lounge_sports_news_posts to service_role;

-- Cron: every 5 minutes. The Edge returns early unless the bot is running.
create or replace function public.invoke_lounge_sports_news_poll()
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
    raise warning 'invoke_lounge_sports_news_poll: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/lounge-sports-news-poll',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_lounge_sports_news_poll: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_lounge_sports_news_poll() from public;
grant execute on function public.invoke_lounge_sports_news_poll() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'lounge_sports_news_poll'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule('lounge_sports_news_poll', '*/5 * * * *', $$select public.invoke_lounge_sports_news_poll();$$);

commit;
