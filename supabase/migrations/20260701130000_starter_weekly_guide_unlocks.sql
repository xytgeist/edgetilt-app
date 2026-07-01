-- Starter weekly premium guide drops: per-user random roll from remaining 2020+ published slugs.
-- Pool rules mirror `GUIDE_WEEKLY_DROP_MIN_RELEASE_YEAR` + `FREE_GUIDE_SLUGS` in guideAccess.js.

create table if not exists public.starter_weekly_guide_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  guide_slug text not null,
  drop_week date not null,
  granted_at timestamptz not null default now(),
  constraint starter_weekly_guide_unlocks_user_slug_key unique (user_id, guide_slug),
  constraint starter_weekly_guide_unlocks_user_week_key unique (user_id, drop_week)
);

create index if not exists starter_weekly_guide_unlocks_user_id_idx
  on public.starter_weekly_guide_unlocks (user_id);

comment on table public.starter_weekly_guide_unlocks is
  'Accumulated weekly premium guide grants for slots-edge-starter. One row per earned slug; drop_week is UTC Monday week start.';

-- ---------------------------------------------------------------------------
-- Free-tier slugs excluded from the weekly drop pool (keep in sync with FREE_GUIDE_SLUGS)
-- ---------------------------------------------------------------------------
create or replace function public.starter_weekly_drop_free_guide_slugs()
returns text[]
language sql
immutable
as $$
  select array[
    '5-coin-frenzy-jackpots',
    '88-fortunes-emperors-coins',
    'ags-must-hit-by',
    'ainsworth-must-hit-by',
    'brian-christophers-world-cruise',
    'buffalo-link',
    'buffalo-cash',
    'lightning-buffalo-link',
    'igt-must-hit-by',
    'cashman-bingo',
    'crush-conquest',
    'crush-dynasty',
    'dancing-phoenix-soaring-dragon',
    'golden-egypt'
  ]::text[];
$$;

comment on function public.starter_weekly_drop_free_guide_slugs() is
  'Mirror of FREE_GUIDE_SLUGS (guideAccess.js). Update both when the free list changes.';

-- ---------------------------------------------------------------------------
-- Client read: all weekly-drop slugs earned by auth user
-- ---------------------------------------------------------------------------
create or replace function public.get_my_starter_weekly_guide_slugs()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(u.guide_slug order by u.granted_at),
    '{}'::text[]
  )
  from public.starter_weekly_guide_unlocks u
  where u.user_id = auth.uid();
$$;

grant execute on function public.get_my_starter_weekly_guide_slugs() to authenticated;

-- ---------------------------------------------------------------------------
-- Cron / service: one random remaining 2020+ slug per user per UTC week
-- ---------------------------------------------------------------------------
create or replace function public.grant_starter_weekly_guide_drop(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  picked text;
  week_start date := date_trunc('week', timezone('UTC', now()))::date;
begin
  if p_user_id is null then
    return null;
  end if;

  if not public.user_has_entitlement(p_user_id, 'slots-edge-starter') then
    raise exception 'user lacks active slots-edge-starter entitlement';
  end if;

  select u.guide_slug
  into picked
  from public.starter_weekly_guide_unlocks u
  where u.user_id = p_user_id
    and u.drop_week = week_start
  limit 1;

  if picked is not null then
    return picked;
  end if;

  with eligible as (
    select distinct lower(trim(coalesce(m.slug, g.slug))) as slug
    from public.guides g
    inner join public.machines m on m.id = g.machine_id
    where g.published = true
      and m.release_year >= 2020
      and lower(trim(coalesce(m.slug, g.slug))) <> ''
      and lower(trim(coalesce(m.slug, g.slug))) <> all (
        select unnest(public.starter_weekly_drop_free_guide_slugs())
      )
  ),
  remaining as (
    select e.slug
    from eligible e
    where not exists (
      select 1
      from public.starter_weekly_guide_unlocks u
      where u.user_id = p_user_id
        and u.guide_slug = e.slug
    )
  )
  select r.slug
  into picked
  from remaining r
  order by random()
  limit 1;

  if picked is null then
    return null;
  end if;

  insert into public.starter_weekly_guide_unlocks (user_id, guide_slug, drop_week)
  values (p_user_id, picked, week_start);

  return picked;
end;
$$;

comment on function public.grant_starter_weekly_guide_drop(uuid) is
  'Service/cron: pick one uniform random slug from this user''s remaining 2020+ pool; idempotent per UTC week.';

revoke all on function public.grant_starter_weekly_guide_drop(uuid) from public;
grant execute on function public.grant_starter_weekly_guide_drop(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.starter_weekly_guide_unlocks enable row level security;

drop policy if exists "starter_weekly_guide_unlocks_select_own" on public.starter_weekly_guide_unlocks;
create policy "starter_weekly_guide_unlocks_select_own"
  on public.starter_weekly_guide_unlocks
  for select
  using (auth.uid() = user_id);
