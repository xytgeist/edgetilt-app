-- Fix: previous migrations used CREATE OR REPLACE on lounge_activity_events_page
-- after 20260531140000 added play_log columns and changed the return type.
-- CREATE OR REPLACE silently fails when the return type differs, so chat_dm was
-- never actually excluded. Use DROP + CREATE to force the correct version.

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
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean,
  play_log_game_name text,
  play_log_share_percent numeric
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
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle            as actor_handle,
    p.display_name      as actor_display_name,
    p.avatar_url        as actor_avatar_url,
    p.role              as actor_role,
    coalesce(p.is_og, false) as actor_is_og,
    tpl.display_name    as play_log_game_name,
    sp.share_percent    as play_log_share_percent
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  left join public.play_log_entries ple on ple.id = ae.play_log_entry_id
  left join public.play_log_game_templates tpl on tpl.id = ple.template_id
  left join public.play_log_session_partners sp
    on sp.session_id = ple.session_id
   and sp.user_id = auth.uid()
   and sp.participant_kind = 'user'
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

-- Also fix lounge_activity_unread_count to exclude both chat types.
create or replace function public.lounge_activity_unread_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.activity_events ae
  where ae.recipient_user_id = auth.uid()
    and ae.read_at is null
    and ae.event_type not in ('chat_dm', 'chat_group_invite');
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;
grant execute on function public.lounge_activity_unread_count() to authenticated;
