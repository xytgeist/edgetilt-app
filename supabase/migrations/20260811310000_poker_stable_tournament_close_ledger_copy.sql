-- Tournament package close ledger copy was still cash-era:
-- "no slice payments due" / personal credited $0 / "rebalanced to baseline".
-- Close books already return roll×retained% (player) and roll share + unused
-- markup (backer via Commit sync). Rewrite the history writer to match.

begin;

create or replace function public.poker_stable_write_settlement_ledger_for_user(
  p_settlement_id uuid,
  p_commit_id uuid,
  p_deal_id uuid,
  p_finalize boolean,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_st public.poker_stable_deal_settlements%rowtype;
  v_stakee uuid;
  v_player_name text;
  v_kind text;
  v_prefix text;
  v_player_payments text := '';
  v_line record;
  v_backer_name text;
  v_backer_credit numeric;
  v_player_credit numeric;
  v_baseline numeric;
  v_player_msg text;
  v_backer_msg text;
  v_sold numeric;
  v_retained numeric;
  v_return numeric;
  v_overall numeric;
  v_roll numeric;
  v_action numeric;
  v_roll_share numeric;
  v_unused numeric;
  v_alloc_id uuid;
  v_bits text;
begin
  select * into v_st from public.poker_stable_deal_settlements where id = p_settlement_id;
  select * into v_deal from public.poker_stable_deals where id = p_deal_id;
  if v_st.id is null or v_deal.id is null then
    return;
  end if;

  v_stakee := v_deal.stakee_user_id;
  v_player_name := public.poker_stable_profile_display_name(v_stakee);
  v_kind := case when p_finalize then 'close_settlement' else 'periodic_settlement' end;
  v_prefix := case when p_finalize then 'Close settlement' else 'Periodic settlement' end;
  v_baseline := coalesce(v_st.baseline_at_settle, 0);
  v_roll := coalesce(v_st.roll_at_settle, 0);
  v_player_credit := 0;

  -- Tournament package close: capital returns, not cash profit-slice payments / rebalance.
  if p_finalize and v_deal.deal_type = 'tournament_package' then
    if p_user_id = v_stakee then
      if exists (
        select 1
        from public.poker_stable_deal_settlement_lines l
        where l.settlement_id = p_settlement_id
      ) then
        select public.poker_stable_round_money(coalesce(sum(s.action_pct), 0))
        into v_sold
        from public.poker_stable_deal_settlement_lines l
        join public.poker_stable_deal_slices s on s.id = l.slice_id
        where l.settlement_id = p_settlement_id;
      else
        v_sold := public.poker_stable_deal_active_sold_action_pct(v_deal.id);
      end if;
      if v_sold is null then
        v_sold := 0;
      end if;
      v_retained := greatest(0, public.poker_stable_round_money(100 - v_sold));
      v_return := public.poker_stable_round_money(v_roll * (v_retained / 100.0));
      v_overall := public.poker_stable_round_money(
        v_return - public.poker_stable_round_money(v_baseline * (v_retained / 100.0))
      );

      v_player_msg := format(
        '%s: %s returned to personal bankroll (your share of the %s remaining stake). Overall P/L %s%s.',
        v_prefix,
        public.poker_stable_fmt_money(v_return),
        public.poker_stable_fmt_money(v_roll),
        case when v_overall > 0 then '+' else '' end,
        public.poker_stable_fmt_money(v_overall)
      );

      insert into public.poker_stable_ledger_entries (
        deal_id, settlement_id, commit_id, user_id, entry_kind, message
      )
      values (
        p_deal_id, p_settlement_id, p_commit_id, p_user_id, v_kind, v_player_msg
      );
      return;
    end if;

    for v_line in
      select l.*, s.staker_user_id, s.counterparty_kind, s.guest_label, s.slice_index, s.action_pct, s.id as slice_row_id
      from public.poker_stable_deal_settlement_lines l
      join public.poker_stable_deal_slices s on s.id = l.slice_id
      where l.settlement_id = p_settlement_id
        and s.counterparty_kind = 'user'
        and s.staker_user_id = p_user_id
      order by s.slice_index
    loop
      v_action := coalesce(v_line.action_pct, 0) / 100.0;
      v_roll_share := public.poker_stable_round_money(v_roll * v_action);

      select a.id into v_alloc_id
      from public.poker_stable_backer_allocations a
      where a.slice_id = v_line.slice_row_id
      limit 1;

      v_unused := 0;
      if v_alloc_id is not null then
        v_unused := public.poker_stable_allocation_unused_markup_fee(v_alloc_id);
      end if;

      v_bits := format(
        '%s stake value returned to backing bankroll',
        public.poker_stable_fmt_money(v_roll_share)
      );
      if v_unused > 0.005 then
        v_bits := v_bits || format(
          '. %s unused markup refunded',
          public.poker_stable_fmt_money(v_unused)
        );
      end if;

      v_backer_msg := format('%s: %s.', v_prefix, v_bits);

      insert into public.poker_stable_ledger_entries (
        deal_id, settlement_id, commit_id, user_id, entry_kind, message
      )
      values (
        p_deal_id, p_settlement_id, p_commit_id, p_user_id, v_kind, v_backer_msg
      );
    end loop;
    return;
  end if;

  if p_user_id = v_stakee then
    if coalesce(v_st.profit_above_baseline, 0) > 0 then
      select public.poker_stable_round_money(
        coalesce(v_st.profit_above_baseline, 0) - coalesce(sum(
          case
            when l.direction = 'player_to_staker' then l.total_owed
            else -l.total_owed
          end
        ), 0)
      )
      into v_player_credit
      from public.poker_stable_deal_settlement_lines l
      where l.settlement_id = p_settlement_id;
    end if;

    for v_line in
      select l.*, s.staker_user_id, s.counterparty_kind, s.guest_label
      from public.poker_stable_deal_settlement_lines l
      join public.poker_stable_deal_slices s on s.id = l.slice_id
      where l.settlement_id = p_settlement_id
      order by s.slice_index
    loop
      if v_line.direction = 'player_to_staker' and v_line.total_owed > 0 then
        v_backer_name := case
          when v_line.counterparty_kind = 'guest' then coalesce(v_line.guest_label, 'Guest')
          else public.poker_stable_profile_display_name(v_line.staker_user_id)
        end;
        if v_player_payments <> '' then
          v_player_payments := v_player_payments || '; ';
        end if;
        v_player_payments := v_player_payments || format('you paid %s %s', v_backer_name, public.poker_stable_fmt_money(v_line.total_owed));
      end if;
    end loop;

    if v_player_payments = '' then
      v_player_payments := 'no profit-share payments due';
    end if;

    v_player_msg := format(
      '%s: %s. Your personal bankroll was credited: %s. Stake bankroll rebalanced to %s.',
      v_prefix,
      v_player_payments,
      public.poker_stable_fmt_money(v_player_credit),
      public.poker_stable_fmt_money(v_baseline)
    );

    insert into public.poker_stable_ledger_entries (
      deal_id, settlement_id, commit_id, user_id, entry_kind, message
    )
    values (
      p_deal_id, p_settlement_id, p_commit_id, p_user_id, v_kind, v_player_msg
    );

    return;
  end if;

  for v_line in
    select l.*, s.staker_user_id, s.counterparty_kind, s.guest_label, s.slice_index
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where l.settlement_id = p_settlement_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
    order by s.slice_index
  loop
    v_backer_name := public.poker_stable_profile_display_name(v_line.staker_user_id);
    v_backer_credit := public.poker_stable_round_money(v_line.profit_share + v_line.rakeback_share);

    if v_line.direction = 'player_to_staker' and v_line.total_owed > 0 then
      v_backer_msg := format(
        '%s: %s paid you %s. Your personal balance was credited: %s. Stake bankroll rebalanced to %s.',
        v_prefix,
        v_player_name,
        public.poker_stable_fmt_money(v_line.total_owed),
        public.poker_stable_fmt_money(v_backer_credit),
        public.poker_stable_fmt_money(v_baseline)
      );
    elsif v_line.direction = 'staker_to_player' and v_line.total_owed > 0 then
      v_backer_msg := format(
        '%s: you paid %s %s. Your personal balance was adjusted: %s. Stake bankroll rebalanced to %s.',
        v_prefix,
        v_player_name,
        public.poker_stable_fmt_money(v_line.total_owed),
        public.poker_stable_fmt_money(-v_backer_credit),
        public.poker_stable_fmt_money(v_baseline)
      );
    else
      v_backer_msg := format(
        '%s: stake bankroll rebalanced to %s.',
        v_prefix,
        public.poker_stable_fmt_money(v_baseline)
      );
    end if;

    insert into public.poker_stable_ledger_entries (
      deal_id, settlement_id, commit_id, user_id, entry_kind, message
    )
    values (
      p_deal_id, p_settlement_id, p_commit_id, p_user_id, v_kind, v_backer_msg
    );
  end loop;
end;
$$;

comment on function public.poker_stable_write_settlement_ledger_for_user(uuid, uuid, uuid, boolean, uuid) is
  'Writes asymmetric settlement ledger text. Tournament package close uses roll returns / unused markup (not cash rebalance copy).';

-- Rewrite existing cash-era tournament close ledger rows.
do $$
declare
  r record;
  v_deal public.poker_stable_deals%rowtype;
  v_st public.poker_stable_deal_settlements%rowtype;
  v_sold numeric;
  v_retained numeric;
  v_return numeric;
  v_overall numeric;
  v_roll numeric;
  v_baseline numeric;
  v_action numeric;
  v_roll_share numeric;
  v_unused numeric;
  v_alloc_id uuid;
  v_msg text;
  v_bits text;
begin
  for r in
    select le.id, le.deal_id, le.settlement_id, le.user_id, le.message
    from public.poker_stable_ledger_entries le
    join public.poker_stable_deals d on d.id = le.deal_id
    where le.entry_kind = 'close_settlement'
      and d.deal_type = 'tournament_package'
      and (
        le.message ilike '%rebalanced to%'
        or le.message ilike '%no slice payments%'
        or le.message ilike '%personal bankroll was credited: $0%'
      )
  loop
    select * into v_deal from public.poker_stable_deals where id = r.deal_id;
    select * into v_st from public.poker_stable_deal_settlements where id = r.settlement_id;
    if v_deal.id is null or v_st.id is null then
      continue;
    end if;

    v_roll := coalesce(v_st.roll_at_settle, 0);
    v_baseline := coalesce(v_st.baseline_at_settle, 0);

    if r.user_id = v_deal.stakee_user_id then
      if exists (
        select 1 from public.poker_stable_deal_settlement_lines l where l.settlement_id = v_st.id
      ) then
        select public.poker_stable_round_money(coalesce(sum(s.action_pct), 0))
        into v_sold
        from public.poker_stable_deal_settlement_lines l
        join public.poker_stable_deal_slices s on s.id = l.slice_id
        where l.settlement_id = v_st.id;
      else
        v_sold := public.poker_stable_deal_active_sold_action_pct(v_deal.id);
      end if;
      if v_sold is null then v_sold := 0; end if;
      v_retained := greatest(0, public.poker_stable_round_money(100 - v_sold));
      v_return := public.poker_stable_round_money(v_roll * (v_retained / 100.0));
      v_overall := public.poker_stable_round_money(
        v_return - public.poker_stable_round_money(v_baseline * (v_retained / 100.0))
      );
      v_msg := format(
        'Close settlement: %s returned to personal bankroll (your share of the %s remaining stake). Overall P/L %s%s.',
        public.poker_stable_fmt_money(v_return),
        public.poker_stable_fmt_money(v_roll),
        case when v_overall > 0 then '+' else '' end,
        public.poker_stable_fmt_money(v_overall)
      );
      update public.poker_stable_ledger_entries set message = v_msg where id = r.id;
    else
      select s.action_pct, a.id
      into v_action, v_alloc_id
      from public.poker_stable_deal_slices s
      left join public.poker_stable_backer_allocations a on a.slice_id = s.id
      where s.deal_id = v_deal.id
        and s.counterparty_kind = 'user'
        and s.staker_user_id = r.user_id
      order by s.slice_index
      limit 1;

      if v_action is null then
        continue;
      end if;

      v_roll_share := public.poker_stable_round_money(v_roll * (v_action / 100.0));
      v_unused := case
        when v_alloc_id is not null then public.poker_stable_allocation_unused_markup_fee(v_alloc_id)
        else 0
      end;
      v_bits := format(
        '%s stake value returned to backing bankroll',
        public.poker_stable_fmt_money(v_roll_share)
      );
      if v_unused > 0.005 then
        v_bits := v_bits || format(
          '. %s unused markup refunded',
          public.poker_stable_fmt_money(v_unused)
        );
      end if;
      v_msg := format('Close settlement: %s.', v_bits);
      update public.poker_stable_ledger_entries set message = v_msg where id = r.id;
    end if;
  end loop;
end;
$$;

commit;
