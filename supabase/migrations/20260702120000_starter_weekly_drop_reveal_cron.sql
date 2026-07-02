-- Starter weekly guide drop: scratch reveal tracking, in-app notifications, weekly cron job.

alter table public.starter_weekly_guide_unlocks
  add column if not exists scratch_revealed_at timestamptz;

comment on column public.starter_weekly_guide_unlocks.scratch_revealed_at is
  'When the member completed the scratch (or tap-to-reveal) ceremony. Guide access is granted at drop time regardless.';

alter table public.activity_events
  add column if not exists starter_weekly_unlock_id uuid references public.starter_weekly_guide_unlocks (id) on delete set null;

create index if not exists activity_events_starter_weekly_unlock_id_idx
  on public.activity_events (starter_weekly_unlock_id)
  where starter_weekly_unlock_id is not null;

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid',
      'chat_dm',
      'chat_group_invite',
      'starter_weekly_guide_drop'
    )
  );

-- ---------------------------------------------------------------------------
-- System actor for self-directed Starter drop notifications (@edgelord).
-- ---------------------------------------------------------------------------
create or replace function public.starter_weekly_drop_system_actor_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id
  from public.profiles p
  where lower(trim(p.handle)) = 'edgelord'
  limit 1;
$$;

revoke all on function public.starter_weekly_drop_system_actor_user_id() from public;

create or replace function public.starter_weekly_drop_create_activity_event(
  p_recipient uuid,
  p_unlock_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_event_id uuid;
begin
  if p_recipient is null or p_unlock_id is null then
    return null;
  end if;

  v_actor := public.starter_weekly_drop_system_actor_user_id();
  if v_actor is null or v_actor = p_recipient then
    raise warning 'starter_weekly_drop_create_activity_event: missing edgelord system actor';
    return null;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    starter_weekly_unlock_id
  )
  values (p_recipient, v_actor, 'starter_weekly_guide_drop', p_unlock_id)
  returning id into v_event_id;

  return v_event_id;
exception
  when others then
    raise warning 'starter_weekly_drop_create_activity_event: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.starter_weekly_drop_create_activity_event(uuid, uuid) from public;
grant execute on function public.starter_weekly_drop_create_activity_event(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Weekly job: grant + notify every active Starter subscriber (UTC week).
-- ---------------------------------------------------------------------------
create or replace function public.run_starter_weekly_guide_drop_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_slug text;
  v_unlock_id uuid;
  v_week_start date := date_trunc('week', timezone('UTC', now()))::date;
  v_granted int := 0;
  v_notified int := 0;
  v_skipped int := 0;
begin
  for v_user_id in
    select distinct us.user_id
    from public.user_subscriptions us
    where us.product_slug = 'slots-edge-starter'
      and us.status in ('active', 'trialing')
  loop
    begin
      v_slug := public.grant_starter_weekly_guide_drop(v_user_id);
      if v_slug is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_granted := v_granted + 1;

      select u.id
      into v_unlock_id
      from public.starter_weekly_guide_unlocks u
      where u.user_id = v_user_id
        and u.drop_week = v_week_start
        and u.guide_slug = v_slug
      limit 1;

      if v_unlock_id is not null then
        if public.starter_weekly_drop_create_activity_event(v_user_id, v_unlock_id) is not null then
          v_notified := v_notified + 1;
        end if;
      end if;
    exception
      when others then
        raise warning 'run_starter_weekly_guide_drop_job user %: %', v_user_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'week_start', v_week_start,
    'granted', v_granted,
    'notified', v_notified,
    'skipped', v_skipped
  );
end;
$$;

comment on function public.run_starter_weekly_guide_drop_job() is
  'Cron/service: one random weekly drop per active slots-edge-starter user; creates activity_events for scratch reveal.';

revoke all on function public.run_starter_weekly_guide_drop_job() from public;
grant execute on function public.run_starter_weekly_guide_drop_job() to service_role;

-- ---------------------------------------------------------------------------
-- Client: pending scratch sessions (FIFO) + reveal payload + mark scratched.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_pending_starter_weekly_drops()
returns table (
  unlock_id uuid,
  guide_slug text,
  drop_week date,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id as unlock_id,
    u.guide_slug,
    u.drop_week,
    u.granted_at as created_at
  from public.starter_weekly_guide_unlocks u
  where u.user_id = auth.uid()
    and u.scratch_revealed_at is null
  order by u.drop_week asc, u.granted_at asc, u.id asc;
$$;

grant execute on function public.get_my_pending_starter_weekly_drops() to authenticated;

create or replace function public.get_starter_weekly_drop_reveal(p_unlock_id uuid)
returns table (
  unlock_id uuid,
  guide_slug text,
  guide_title text,
  hero_url text,
  drop_week date,
  scratch_revealed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id as unlock_id,
    u.guide_slug,
    coalesce(nullif(trim(m.name), ''), nullif(trim(g.title), ''), u.guide_slug) as guide_title,
    coalesce(g.thumbnail_url, '') as hero_url,
    u.drop_week,
    u.scratch_revealed_at
  from public.starter_weekly_guide_unlocks u
  left join public.guides g
    on g.published = true
   and lower(trim(coalesce(g.slug, ''))) = lower(trim(u.guide_slug))
  left join public.machines m on m.id = g.machine_id
  where u.id = p_unlock_id
    and u.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.get_starter_weekly_drop_reveal(uuid) to authenticated;

create or replace function public.mark_starter_weekly_drop_scratched(p_unlock_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_unlock_id is null then
    return false;
  end if;

  update public.starter_weekly_guide_unlocks u
  set scratch_revealed_at = coalesce(u.scratch_revealed_at, now())
  where u.id = p_unlock_id
    and u.user_id = auth.uid();

  return found;
end;
$$;

grant execute on function public.mark_starter_weekly_drop_scratched(uuid) to authenticated;

create or replace function public.starter_has_exhausted_weekly_drop_pool(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
  granted as (
    select lower(trim(u.guide_slug)) as slug
    from public.starter_weekly_guide_unlocks u
    where u.user_id = coalesce(p_user_id, auth.uid())
  )
  select not exists (
    select 1
    from eligible e
    where not exists (
      select 1 from granted g where g.slug = e.slug
    )
  );
$$;

grant execute on function public.starter_has_exhausted_weekly_drop_pool(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- In-app notifications page includes starter_weekly_unlock_id.
-- ---------------------------------------------------------------------------
drop function if exists public.lounge_activity_events_page(integer, timestamptz, uuid);

create or replace function public.lounge_activity_events_page(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  post_id uuid,
  comment_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean,
  starter_weekly_unlock_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ae.id,
    ae.event_type,
    ae.post_id,
    ae.comment_id,
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle as actor_handle,
    p.display_name as actor_display_name,
    p.avatar_url as actor_avatar_url,
    p.role as actor_role,
    coalesce(p.is_og, false) as actor_is_og,
    ae.starter_weekly_unlock_id
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  where ae.recipient_user_id = auth.uid()
    and ae.event_type not in ('chat_dm', 'chat_group_invite')
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron: Monday 00:10 UTC (after week boundary).
-- Prereq: enable pg_cron extension in Supabase Dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_starter_weekly_guide_drop_job()
returns void
language plpgsql
security definer
set search_path = public, cron, extensions, pg_temp
as $$
begin
  perform public.run_starter_weekly_guide_drop_job();
exception
  when others then
    raise warning 'invoke_starter_weekly_guide_drop_job: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_starter_weekly_guide_drop_job() from public;
grant execute on function public.invoke_starter_weekly_guide_drop_job() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'starter_weekly_guide_drop_weekly'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'starter_weekly_guide_drop_weekly',
  '10 0 * * 1',
  $$select public.invoke_starter_weekly_guide_drop_job();$$
);
