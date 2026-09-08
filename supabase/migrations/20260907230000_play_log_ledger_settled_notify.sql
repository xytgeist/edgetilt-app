-- Play Logbook ledger: independent books. Settle All notifies the other Edge user
-- so they can accept and update their own books. We are not a bank.

alter table public.play_log_ledger_settlements
  add column if not exists counterpart_accepted_at timestamptz;

comment on column public.play_log_ledger_settlements.counterpart_accepted_at is
  'When the counterpart updated their own books. Null means waiting on them.';

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
  'Allowed activity_events.event_type values (includes play_log_ledger_settled).';

create or replace function public.play_log_ledger_settled_activity()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.counterpart_kind is distinct from 'user' then
    return new;
  end if;
  if new.counterpart_user_id is null or new.counterpart_user_id = new.actor_user_id then
    return new;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    detail_text
  )
  values (
    new.counterpart_user_id,
    new.actor_user_id,
    'play_log_ledger_settled',
    nullif(btrim(coalesce(new.message, '')), '')
  );
  return new;
exception
  when others then
    raise warning 'play_log_ledger_settled_activity: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists play_log_ledger_settled_activity on public.play_log_ledger_settlements;
create trigger play_log_ledger_settled_activity
  after insert on public.play_log_ledger_settlements
  for each row
  execute function public.play_log_ledger_settled_activity();

create or replace function public.play_log_ledger_accept_settlement(p_id uuid)
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

  update public.play_log_ledger_settlements s
  set counterpart_accepted_at = now()
  where s.id = p_id
    and s.counterpart_kind = 'user'
    and s.counterpart_user_id = v_uid
    and s.counterpart_accepted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Settlement not found or already updated';
  end if;

  return v_row;
end;
$$;

comment on function public.play_log_ledger_accept_settlement(uuid) is
  'Counterpart updates their own ledger books for a Settle All row.';

revoke all on function public.play_log_ledger_accept_settlement(uuid) from public;
grant execute on function public.play_log_ledger_accept_settlement(uuid) to authenticated;

notify pgrst, 'reload schema';
