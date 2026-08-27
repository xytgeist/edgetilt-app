-- poker_stable_detach_stake_sessions_to_personal took a deal id and checked
-- nothing about who was asking. It is SECURITY DEFINER, so any logged-in user
-- could point it at any deal id and force that deal's sessions onto the stakee's
-- personal bankroll, mark the deal declined, and mutate
-- poker_bankroll_profiles.overall_bankroll. Found during the 20260827150000
-- anon-execute audit: grants alone could not fix this one, since the browser
-- legitimately calls it (pokerStableApi.js revokeDeal).
--
-- ⚠️ The obvious guard is wrong. "Caller must be the stakee" breaks the flow
-- this function exists for: poker_stable_decline_backer_slice and the deals
-- trigger both reach it while the caller is the *backer* who just declined the
-- last slice, not the stakee. Guard on deal participation instead.
--
-- auth.uid() is null on the cron / service_role / trigger-under-service paths,
-- which must stay open, so the check only applies when there is a real caller.
-- Body is otherwise byte-identical to 20260806020000.

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
begin
  if p_deal_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_deal');
  end if;

  -- stakee, staker, or any slice backer on this deal; internal callers have no JWT
  if auth.uid() is not null
     and not public.poker_stable_user_can_access_deal(p_deal_id, auth.uid()) then
    raise exception 'not authorized for this deal';
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

-- Same signature, so this replaced rather than overloaded. Re-assert the ACL
-- anyway: 20260827150000 dropped PUBLIC on this function, and `revoke ... from
-- public` does not touch Supabase's named anon grant.
grant execute on function public.poker_stable_detach_stake_sessions_to_personal(uuid) to service_role;
revoke all on function public.poker_stable_detach_stake_sessions_to_personal(uuid) from public;
revoke all on function public.poker_stable_detach_stake_sessions_to_personal(uuid) from anon;
grant execute on function public.poker_stable_detach_stake_sessions_to_personal(uuid) to authenticated;

comment on function public.poker_stable_detach_stake_sessions_to_personal(uuid) is
  'Moves a deal''s completed sessions to the stakee''s personal bankroll once no backers remain. Caller must be a participant on the deal (stakee, staker, or slice backer) when invoked with a JWT; internal trigger / service_role paths pass auth.uid() = null.';
