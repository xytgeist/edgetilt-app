-- Fix poker_stable_delete_stake_session: ledger detail used game_custom_name,
-- which is a client form field only ... poker_bankroll_sessions has game_variant.

begin;

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
    nullif(trim(coalesce(v_session.game_variant, '')), ''),
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

comment on function public.poker_stable_delete_stake_session(uuid) is
  'Stakee deletes an on-stake session; writes session_deleted ledger audit. Uses game_variant (not client-only game_custom_name).';

revoke all on function public.poker_stable_delete_stake_session(uuid) from public;
grant execute on function public.poker_stable_delete_stake_session(uuid) to authenticated;

commit;
