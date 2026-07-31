-- AP Guide release announcements: in-app Alerts + web push (via activity_events trigger).
-- Broadcast: service_role only — scripts/broadcast-ap-guide-released.mjs

begin;

alter table public.activity_events
  add column if not exists guide_slug text;

comment on column public.activity_events.guide_slug is
  'AP Guides deep link slug for ap_guide_released notifications.';

create index if not exists activity_events_guide_release_idx
  on public.activity_events (guide_slug, recipient_user_id)
  where event_type = 'ap_guide_released' and guide_slug is not null;

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
      'chat_call_invite',
      'chat_call_missed',
      'starter_weekly_guide_drop',
      'creator_fan_sub',
      'poker_tournament_swap',
      'poker_tournament_swap_result',
      'ap_guide_released'
    )
  );

create or replace function public.admin_broadcast_ap_guide_released(
  p_guide_slug text,
  p_title text default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_guide_slug, '')));
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_actor uuid;
  v_guide_title text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_recipients int := 0;
begin
  if v_slug = '' then
    raise exception 'guide_slug required';
  end if;

  select g.title
  into v_guide_title
  from public.guides g
  where g.slug = v_slug
    and g.published = true
  limit 1;

  if v_guide_title is null then
    raise exception 'published guide not found for slug %', v_slug;
  end if;

  v_title := coalesce(v_title, v_guide_title);
  v_actor := public.starter_weekly_drop_system_actor_user_id();

  if v_actor is null then
    raise exception 'system actor (edgelord) missing — cannot broadcast';
  end if;

  select count(*)::int
  into v_recipients
  from public.profiles p
  where p.user_id is not null
    and p.user_id <> v_actor
    and not exists (
      select 1
      from public.activity_events ae
      where ae.recipient_user_id = p.user_id
        and ae.event_type = 'ap_guide_released'
        and ae.guide_slug = v_slug
    );

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'guide_slug', v_slug,
      'title', v_title,
      'would_notify', v_recipients,
      'already_notified', (
        select count(*)::int
        from public.activity_events ae
        where ae.event_type = 'ap_guide_released'
          and ae.guide_slug = v_slug
      )
    );
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    guide_slug,
    detail_text
  )
  select
    p.user_id,
    v_actor,
    'ap_guide_released',
    v_slug,
    v_title
  from public.profiles p
  where p.user_id is not null
    and p.user_id <> v_actor
    and not exists (
      select 1
      from public.activity_events ae
      where ae.recipient_user_id = p.user_id
        and ae.event_type = 'ap_guide_released'
        and ae.guide_slug = v_slug
    );

  get diagnostics v_inserted = row_count;

  select count(*)::int
  into v_skipped
  from public.profiles p
  where p.user_id is not null
    and p.user_id <> v_actor
    and exists (
      select 1
      from public.activity_events ae
      where ae.recipient_user_id = p.user_id
        and ae.event_type = 'ap_guide_released'
        and ae.guide_slug = v_slug
    );

  return jsonb_build_object(
    'guide_slug', v_slug,
    'title', v_title,
    'inserted', v_inserted,
    'skipped_existing', greatest(v_skipped - v_inserted, 0),
    'total_marked', v_skipped
  );
end;
$$;

revoke all on function public.admin_broadcast_ap_guide_released(text, text, boolean) from public;
grant execute on function public.admin_broadcast_ap_guide_released(text, text, boolean) to service_role;

comment on function public.admin_broadcast_ap_guide_released(text, text, boolean) is
  'Insert ap_guide_released activity_events for all profiles (idempotent per guide slug). service_role only.';

drop function if exists public.lounge_activity_events_page(integer, timestamptz, uuid);

create function public.lounge_activity_events_page(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  post_id uuid,
  comment_id uuid,
  play_log_entry_id uuid,
  chat_room_id uuid,
  chat_call_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean,
  play_log_game_name text,
  play_log_share_percent numeric,
  starter_weekly_unlock_id uuid,
  detail_text text,
  poker_tournament_swap_id uuid,
  guide_slug text
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
    ae.play_log_entry_id,
    ae.chat_room_id,
    ae.chat_call_id,
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle as actor_handle,
    p.display_name as actor_display_name,
    p.avatar_url as actor_avatar_url,
    p.role as actor_role,
    coalesce(p.is_og, false) as actor_is_og,
    tpl.display_name as play_log_game_name,
    sp.share_percent as play_log_share_percent,
    ae.starter_weekly_unlock_id,
    ae.detail_text,
    ae.poker_tournament_swap_id,
    ae.guide_slug
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  left join public.play_log_entries ple on ple.id = ae.play_log_entry_id
  left join public.play_log_game_templates tpl on tpl.id = ple.template_id
  left join public.play_log_session_partners sp
    on sp.session_id = ple.session_id
   and sp.user_id = auth.uid()
   and sp.participant_kind = 'user'
  where ae.recipient_user_id = auth.uid()
    and ae.event_type not in (
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite'
    )
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;

comment on function public.lounge_activity_events_page(integer, timestamptz, uuid) is
  'Lounge notifications page. Includes ap_guide_released (guide_slug).';

commit;
