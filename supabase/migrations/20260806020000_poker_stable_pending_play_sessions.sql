-- Pending-play: stakee can log sessions before backers accept.
-- Session delete leaves durable ledger audit. Last backer exit detaches sessions to personal.

-- ---------------------------------------------------------------------------
-- Delete stake session with audit tombstone (P/L preserved in ledger message)
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_delete_stake_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.poker_bankroll_sessions%rowtype;
  v_deal public.poker_stable_deals%rowtype;
  v_pl numeric;
  v_pl_label text;
  v_detail text;
  v_when text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_session_id is null then
    raise exception 'Session required';
  end if;

  select * into v_session
  from public.poker_bankroll_sessions s
  where s.id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;
  if v_session.user_id is distinct from auth.uid() then
    raise exception 'Not your session';
  end if;
  if v_session.deal_id is null then
    raise exception 'Not a stake session';
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = v_session.deal_id;

  if v_deal.id is null or v_deal.stakee_user_id is distinct from auth.uid() then
    raise exception 'Not your stake';
  end if;

  v_pl := public.poker_stable_round_money(
    coalesce(v_session.cash_out, 0)
    - coalesce(v_session.buy_in, 0)
    - coalesce(v_session.rebuy_amount, 0)
    - coalesce(v_session.addon_amount, 0)
    + coalesce(v_session.bounty_winnings, 0)
  );
  if v_pl > 0 then
    v_pl_label := format('+%s', trim(to_char(v_pl, 'FM999999990.00')));
  else
    v_pl_label := trim(to_char(v_pl, 'FM999999990.00'));
  end if;

  v_when := to_char(
    coalesce(v_session.end_at, v_session.start_at, now()) at time zone 'UTC',
    'Mon FMDD, YYYY'
  );
  v_detail := trim(both ' · ' from concat_ws(
    ' · ',
    nullif(trim(coalesce(v_session.venue_name, '')), ''),
    nullif(trim(coalesce(v_session.game_variant, v_session.game_custom_name, '')), ''),
    case
      when v_session.session_type = 'cash'
        and v_session.small_blind is not null
        and v_session.big_blind is not null
      then format('$%s/$%s', trim(to_char(v_session.small_blind, 'FM999999990.00')), trim(to_char(v_session.big_blind, 'FM999999990.00')))
      else null
    end,
    v_when,
    format('P/L %s', v_pl_label)
  ));

  insert into public.poker_stable_ledger_entries (
    deal_id, user_id, entry_kind, message
  ) values (
    v_session.deal_id,
    auth.uid(),
    'session_deleted',
    format('Player deleted session — %s', coalesce(nullif(v_detail, ''), format('P/L %s', v_pl_label)))
  );

  delete from public.poker_bankroll_sessions
  where id = v_session.id;

  perform public.poker_stable_ensure_deal_bankroll_profile(v_session.deal_id);

  return jsonb_build_object(
    'ok', true,
    'deal_id', v_session.deal_id,
    'profit_loss', v_pl
  );
end;
$$;

revoke all on function public.poker_stable_delete_stake_session(uuid) from public;
grant execute on function public.poker_stable_delete_stake_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Detach all stake sessions → personal when no pending/active backers remain
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_detach_stake_sessions_to_personal(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_open_slices int;
  v_session_pl numeric;
  v_session_count int;
  v_personal numeric;
begin
  if p_deal_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_deal');
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id
  for update;

  if v_deal.id is null then
    return jsonb_build_object('ok', false, 'reason', 'deal_not_found');
  end if;

  select count(*)::int into v_open_slices
  from public.poker_stable_deal_slices s
  where s.deal_id = p_deal_id
    and s.status in ('pending', 'active');

  if v_open_slices > 0 then
    return jsonb_build_object('ok', false, 'reason', 'backers_remain', 'open_slices', v_open_slices);
  end if;

  select
    coalesce(sum(
      coalesce(s.cash_out, 0)
      - coalesce(s.buy_in, 0)
      - coalesce(s.rebuy_amount, 0)
      - coalesce(s.addon_amount, 0)
      + coalesce(s.bounty_winnings, 0)
    ), 0),
    count(*)::int
  into v_session_pl, v_session_count
  from public.poker_bankroll_sessions s
  where s.deal_id = p_deal_id
    and s.status is distinct from 'active';

  v_session_pl := public.poker_stable_round_money(v_session_pl);

  if v_session_count > 0 and v_deal.stakee_user_id is not null then
    insert into public.poker_stable_ledger_entries (deal_id, user_id, entry_kind, message)
    values (
      p_deal_id,
      v_deal.stakee_user_id,
      'sessions_detached',
      format(
        'Sessions moved to personal bankroll after all backers declined (%s session%s, P/L %s)',
        v_session_count,
        case when v_session_count = 1 then '' else 's' end,
        case
          when v_session_pl > 0 then format('+%s', trim(to_char(v_session_pl, 'FM999999990.00')))
          else trim(to_char(v_session_pl, 'FM999999990.00'))
        end
      )
    );

    update public.poker_bankroll_sessions
    set deal_id = null
    where deal_id = p_deal_id;

    insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
    values (v_deal.stakee_user_id, v_session_pl)
    on conflict (user_id) do update
      set overall_bankroll = public.poker_stable_round_money(
        public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll
      );
  end if;

  if v_deal.status in ('pending', 'active') then
    update public.poker_stable_deals
    set status = 'declined',
        responded_at = coalesce(responded_at, now())
    where id = p_deal_id
      and status in ('pending', 'active');
  end if;

  delete from public.poker_deal_bankroll_profiles where deal_id = p_deal_id;

  return jsonb_build_object(
    'ok', true,
    'detached_sessions', v_session_count,
    'session_pl', v_session_pl
  );
end;
$$;

revoke all on function public.poker_stable_detach_stake_sessions_to_personal(uuid) from public;
grant execute on function public.poker_stable_detach_stake_sessions_to_personal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Decline pending slice, then maybe detach if no backers remain
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_decline_backer_slice(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_detach jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_slice
  from public.poker_stable_deal_slices s
  where s.id = p_slice_id
  for update;

  if v_slice.id is null then
    raise exception 'Slice not found';
  end if;
  if v_slice.staker_user_id is distinct from auth.uid() then
    raise exception 'Not your slice';
  end if;
  if v_slice.status is distinct from 'pending' then
    raise exception 'Slice is not pending';
  end if;

  update public.poker_stable_deal_slices
  set status = 'declined',
      responded_at = now()
  where id = p_slice_id;

  v_detach := public.poker_stable_detach_stake_sessions_to_personal(v_slice.deal_id);

  return jsonb_build_object(
    'ok', true,
    'deal_id', v_slice.deal_id,
    'slice_id', p_slice_id,
    'detach', v_detach
  );
end;
$$;

revoke all on function public.poker_stable_decline_backer_slice(uuid) from public;
grant execute on function public.poker_stable_decline_backer_slice(uuid) to authenticated;

-- When revoke leaves zero open slices, detach sessions (revoked deals with orphan sessions).
create or replace function public.poker_stable_after_backer_exit_detach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    perform public.poker_stable_detach_stake_sessions_to_personal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists poker_stable_after_backer_exit_detach on public.poker_stable_deals;
create trigger poker_stable_after_backer_exit_detach
  after update of status on public.poker_stable_deals
  for each row
  execute function public.poker_stable_after_backer_exit_detach();
