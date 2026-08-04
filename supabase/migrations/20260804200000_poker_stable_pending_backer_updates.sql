-- Pending stake: notify accepted backers only on session complete; slice nudge RPC + activity type.

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
      'poker_stable_slice_declined'
    )
  );

create or replace function public.poker_stable_session_complete_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice record;
  v_deal_label text;
  v_wl numeric;
  v_detail text;
begin
  if new.deal_id is null or new.status is distinct from 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'completed' then
    return new;
  end if;
  if coalesce(new.notes, '') like '%seed:%' then
    return new;
  end if;

  select d.label into v_deal_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  v_wl :=
    coalesce(new.cash_out, 0)
    - coalesce(new.buy_in, 0)
    - coalesce(new.rebuy_amount, 0)
    - coalesce(new.addon_amount, 0);

  v_detail := format(
    '%s · table %s%s',
    coalesce(v_deal_label, 'Stake session'),
    case when v_wl >= 0 then '+' else '' end,
    trim(to_char(v_wl, 'FM999,999,990.00'))
  );

  for v_slice in
    select s.staker_user_id
    from public.poker_stable_deal_slices s
    where s.deal_id = new.deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and s.status = 'active'
  loop
    perform public.poker_stable_emit_activity_event(
      v_slice.staker_user_id,
      new.user_id,
      'poker_stable_session_complete',
      new.deal_id,
      null,
      v_detail
    );
  end loop;

  return new;
end;
$$;

create or replace function public.poker_stable_nudge_backer_slice(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slice record;
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select
    s.id,
    s.deal_id,
    s.counterparty_kind,
    s.staker_user_id,
    s.status,
    s.label,
    d.stakee_user_id,
    d.label as deal_label,
    d.status as deal_status
  into v_slice
  from public.poker_stable_deal_slices s
  join public.poker_stable_deals d on d.id = s.deal_id
  where s.id = p_slice_id;

  if v_slice.id is null then
    raise exception 'Slice not found';
  end if;
  if v_slice.stakee_user_id <> v_uid then
    raise exception 'Only the player can nudge backers on this stake';
  end if;
  if v_slice.deal_status not in ('pending', 'active') then
    raise exception 'Stake is not open';
  end if;
  if v_slice.status <> 'pending' then
    raise exception 'Backer has already responded';
  end if;

  v_detail := coalesce(nullif(trim(v_slice.label), ''), nullif(trim(v_slice.deal_label), ''), 'Backing invite');

  if v_slice.counterparty_kind = 'user' and v_slice.staker_user_id is not null then
    perform public.poker_stable_emit_activity_event(
      v_slice.staker_user_id,
      v_uid,
      'poker_stable_slice_nudge',
      v_slice.deal_id,
      null,
      v_detail
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'slice_id', p_slice_id,
    'deal_id', v_slice.deal_id,
    'counterparty_kind', v_slice.counterparty_kind
  );
end;
$$;

grant execute on function public.poker_stable_nudge_backer_slice(uuid) to authenticated;

comment on function public.poker_stable_nudge_backer_slice(uuid) is
  'Stakee reminds a pending backer slice; Edge backers get activity + push, guests use poker-stable-notify slice_nudge email.';
