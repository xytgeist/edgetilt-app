-- When a player cancels a pending stake, rewrite Edge invite/nudge Alerts in place
-- (no new push ... activity_events push trigger is INSERT-only).

begin;

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
      'poker_stable_offer_withdrawn'
    )
  );

comment on constraint activity_events_event_type_check on public.activity_events is
  'Allowed activity_events.event_type values (includes poker_stable_offer_withdrawn).';

create or replace function public.poker_stable_cancel_stake_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_label text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.status, d.label
  into v_status, v_label
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status in ('pending', 'active');

  if v_status is null then
    raise exception 'You cannot delete this stake';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.counterparty_kind = 'user'
      and s.status = 'active'
  ) then
    raise exception 'Cannot delete after an Edge backer has accepted';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_settlements
    where deal_id = p_deal_id
  ) then
    raise exception 'Cannot delete a stake that has been settled';
  end if;

  -- Rewrite invite/nudge Alerts before delete (FK on deal_id is ON DELETE SET NULL).
  -- UPDATE does not enqueue push. Bump created_at + clear read_at so Alerts resurfaces.
  update public.activity_events ae
  set
    event_type = 'poker_stable_offer_withdrawn',
    detail_text = coalesce(nullif(trim(v_label), ''), nullif(trim(ae.detail_text), ''), 'Stake offer'),
    created_at = now(),
    read_at = null
  where ae.poker_stable_deal_id = p_deal_id
    and ae.event_type in ('poker_stable_slice_invite', 'poker_stable_slice_nudge');

  delete from public.poker_bankroll_sessions
  where deal_id = p_deal_id
    and user_id = v_uid;

  delete from public.poker_stable_deals
  where id = p_deal_id
    and stakee_user_id = v_uid;
end;
$$;

comment on function public.poker_stable_cancel_stake_deal(uuid) is
  'Stakee deletes a pending stake before any Edge backer accepts; rewrites invite/nudge Alerts to offer_withdrawn.';

revoke all on function public.poker_stable_cancel_stake_deal(uuid) from public;
grant execute on function public.poker_stable_cancel_stake_deal(uuid) to authenticated;

commit;
