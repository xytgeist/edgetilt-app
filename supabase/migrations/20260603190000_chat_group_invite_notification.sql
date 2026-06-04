-- Add chat_group_invite event type and wire it into the push enqueue trigger.
-- Fires an immediate push to each user added to a group (create or add_member).
-- Like chat_dm, chat_group_invite rows exist only for push routing — they must
-- NOT appear in the in-app Lounge notifications panel or badge count.

-- 1. Extend the event_type constraint to include chat_group_invite.
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
      'chat_group_invite'
    )
  );

-- 2. Update enqueue trigger: chat_group_invite → immediate Edge push (same path as
--    other non-batch types). chat_dm keeps its special debounced handler.
create or replace function public.activity_events_enqueue_push()
returns trigger
language plpgsql
security definer
as $$
begin
  begin
    if new.event_type in ('like', 'bookmark') then
      perform public.activity_push_schedule_batch(new);
    elsif new.event_type = 'chat_dm' then
      perform public.activity_push_enqueue_chat_dm(new);
    else
      -- Immediate: comment, reply, mention, follow, repost, play_log_*, chat_group_invite, etc.
      perform public.activity_push_invoke_lounge_edge(
        jsonb_build_object('activityEventId', new.id)
      );
    end if;
  exception when others then
    raise warning 'activity_events_enqueue_push: %', sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.activity_events_enqueue_push() is
  'Like/bookmark → 10s batch. chat_dm → immediate then 60s batch. All others (incl. chat_group_invite) → immediate Edge push.';

-- 3. Exclude chat_group_invite from the in-app notifications panel and badge,
--    same as chat_dm. These rows are push-routing only.
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
    and ae.event_type not in ('chat_dm', 'chat_group_invite')
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
