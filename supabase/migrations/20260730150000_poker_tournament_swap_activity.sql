-- Poker tournament swap → Lounge in-app + push (Edge users).
-- Guests still use Twilio/Resend via poker-tournament-swap-notify.

begin;

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
      'poker_tournament_swap'
    )
  );

comment on constraint activity_events_event_type_check on public.activity_events is
  'Includes poker_tournament_swap: tap → /?tab=poker-bankroll overview.';

commit;
