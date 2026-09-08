-- Actor can nudge the Edge counterpart to update their ledger books.
-- One-hour cooldown per settlement. Guests get no Alert.

alter table public.play_log_ledger_settlements
  add column if not exists counterpart_nudged_at timestamptz;

comment on column public.play_log_ledger_settlements.counterpart_nudged_at is
  'Last time the actor nudged the counterpart to update their books.';

alter table public.activity_events drop constraint if exists activity_events_event_type_check;

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
      'play_log_ledger_settled',
      'play_log_ledger_nudge',
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite',
      'chat_call_missed',
      'chat_mention',
      'starter_weekly_guide_drop',
      'creator_fan_sub',
      'poker_tournament_swap',
      'poker_tournament_swap_result',
      'ap_guide_released',
      'poker_stable_slice_invite',
      'poker_stable_slice_nudge',
      'poker_stable_session_complete',
      'poker_stable_settled',
      'poker_stable_payment_claim',
      'poker_stable_payment_claim_resolved',
      'poker_stable_settlement_proposed',
      'poker_stable_settlement_resolved',
      'poker_stable_commit_recorded',
      'poker_stable_backer_offer',
      'poker_stable_stakee_accepted',
      'poker_stable_stakee_declined',
      'poker_stable_stakee_counter_proposed',
      'poker_stable_staker_counter_accepted',
      'poker_stable_staker_counter_declined',
      'poker_stable_slice_accepted',
      'poker_stable_slice_declined',
      'poker_stable_offer_withdrawn',
      'poker_stable_terms_edited',
      'poker_stable_backer_terms_proposed'
    )
  );

comment on constraint activity_events_event_type_check on public.activity_events is
  'Allowed activity_events.event_type values (includes play_log_ledger_nudge).';

create or replace function public.play_log_ledger_nudge_settlement(p_id uuid)
returns public.play_log_ledger_settlements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.play_log_ledger_settlements;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_id is null then
    raise exception 'Settlement required';
  end if;

  select *
  into v_row
  from public.play_log_ledger_settlements s
  where s.id = p_id
    and s.actor_user_id = v_uid
  for update;

  if v_row.id is null then
    raise exception 'Settlement not found';
  end if;
  if v_row.counterpart_kind is distinct from 'user' or v_row.counterpart_user_id is null then
    raise exception 'Guests cannot be nudged';
  end if;
  if v_row.counterpart_user_id = v_uid then
    raise exception 'Cannot nudge yourself';
  end if;
  if v_row.counterpart_accepted_at is not null then
    raise exception 'They already updated their books';
  end if;
  if v_row.counterpart_declined_at is not null then
    raise exception 'They left this open';
  end if;
  if v_row.counterpart_nudged_at is not null
     and v_row.counterpart_nudged_at > now() - interval '1 hour' then
    raise exception 'Wait before nudging again';
  end if;

  update public.play_log_ledger_settlements s
  set counterpart_nudged_at = now()
  where s.id = v_row.id
  returning * into v_row;

  perform public.activity_events_insert_safe(
    v_row.counterpart_user_id,
    v_uid,
    'play_log_ledger_nudge',
    null,
    null,
    null
  );

  return v_row;
end;
$$;

comment on function public.play_log_ledger_nudge_settlement(uuid) is
  'Actor reminds the Edge counterpart to update their ledger books. One hour cooldown.';

revoke all on function public.play_log_ledger_nudge_settlement(uuid) from public;
grant execute on function public.play_log_ledger_nudge_settlement(uuid) to authenticated;

notify pgrst, 'reload schema';
