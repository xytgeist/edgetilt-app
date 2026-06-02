-- Exclude chat_dm events from the in-app Lounge notifications panel and badge.
-- chat_dm rows live in activity_events for push routing only; they should not
-- appear in the Alerts / notifications list or count toward the unread badge.

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
    and ae.event_type <> 'chat_dm';
$$;

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
  actor_is_og boolean
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
    p.handle            as actor_handle,
    p.display_name      as actor_display_name,
    p.avatar_url        as actor_avatar_url,
    p.role              as actor_role,
    coalesce(p.is_og, false) as actor_is_og
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  where ae.recipient_user_id = auth.uid()
    and ae.event_type <> 'chat_dm'
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_unread_count() to authenticated;
grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;
