-- Session-end swap payout notify: activity type + optional detail_text / swap id.
-- Guests still use Twilio/Resend via poker-tournament-swap-notify kind=result.

begin;

alter table public.activity_events
  add column if not exists detail_text text;

alter table public.activity_events
  add column if not exists poker_tournament_swap_id uuid
    references public.poker_tournament_swaps(id) on delete set null;

create index if not exists activity_events_poker_swap_idx
  on public.activity_events (poker_tournament_swap_id)
  where poker_tournament_swap_id is not null;

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
      'poker_tournament_swap_result'
    )
  );

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
  poker_tournament_swap_id uuid
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
    ae.poker_tournament_swap_id
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
  'Lounge notifications page. Includes poker_tournament_swap_result (detail_text payout line).';

commit;
