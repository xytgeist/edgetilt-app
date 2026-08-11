-- Tournament package: player unsold face is debited from personal Poker bankroll
-- when the stake goes live (no markup on the player's share). On close, credit the
-- player's share of CURRENT roll back to personal. Cancel/revoke refunds remaining
-- contribution. Cash backing unchanged.

begin;

alter table public.poker_stable_deals
  add column if not exists player_package_capital numeric not null default 0;

comment on column public.poker_stable_deals.player_package_capital is
  'Tournament package: face capital currently debited from stakee personal bankroll for unsold action % (baseline × retained %).';

create or replace function public.poker_stable_deal_active_sold_action_pct(p_deal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.poker_stable_round_money(coalesce(sum(s.action_pct), 0))
  from public.poker_stable_deal_slices s
  where s.deal_id = p_deal_id
    and s.status = 'active';
$$;

create or replace function public.poker_stable_clear_player_package_contribution(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_amt numeric;
begin
  select * into v_deal
  from public.poker_stable_deals
  where id = p_deal_id
  for update;

  if v_deal.id is null or v_deal.deal_type <> 'tournament_package' then
    return;
  end if;

  v_amt := public.poker_stable_round_money(coalesce(v_deal.player_package_capital, 0));
  if v_amt > 0.005 and v_deal.stakee_user_id is not null then
    perform public.poker_stable_credit_player_personal_bankroll(v_deal.stakee_user_id, v_amt);
  end if;

  update public.poker_stable_deals
  set player_package_capital = 0
  where id = p_deal_id
    and coalesce(player_package_capital, 0) <> 0;
end;
$$;

comment on function public.poker_stable_clear_player_package_contribution(uuid) is
  'Refund tournament player package contribution to personal bankroll (cancel/revoke).';

create or replace function public.poker_stable_sync_player_package_contribution(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_sold numeric;
  v_retained numeric;
  v_target numeric;
  v_delta numeric;
begin
  select * into v_deal
  from public.poker_stable_deals
  where id = p_deal_id
  for update;

  if v_deal.id is null
     or v_deal.deal_type <> 'tournament_package'
     or v_deal.stakee_user_id is null then
    return;
  end if;

  -- Only while live. Terminal states clear via clear_*; close returns roll share separately.
  if v_deal.status <> 'active' then
    return;
  end if;

  v_sold := public.poker_stable_deal_active_sold_action_pct(p_deal_id);
  v_retained := greatest(0, public.poker_stable_round_money(100 - v_sold));
  v_target := public.poker_stable_round_money(
    coalesce(v_deal.baseline_bankroll, 0) * (v_retained / 100.0)
  );
  v_delta := public.poker_stable_round_money(
    v_target - coalesce(v_deal.player_package_capital, 0)
  );

  if abs(v_delta) > 0.005 then
    -- Positive delta → debit personal; negative → refund overage.
    perform public.poker_stable_credit_player_personal_bankroll(
      v_deal.stakee_user_id,
      -v_delta
    );
  end if;

  update public.poker_stable_deals
  set player_package_capital = v_target
  where id = p_deal_id;
end;
$$;

comment on function public.poker_stable_sync_player_package_contribution(uuid) is
  'Keep stakee personal debit equal to unsold tournament package face while deal is active.';

create or replace function public.poker_stable_trg_sync_player_package_on_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deal_type is distinct from 'tournament_package' then
    return new;
  end if;

  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.poker_stable_sync_player_package_contribution(new.id);
  elsif new.status in ('revoked', 'declined', 'cancelled')
     and coalesce(old.player_package_capital, 0) > 0.005 then
    perform public.poker_stable_clear_player_package_contribution(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists poker_stable_trg_sync_player_package_on_deal on public.poker_stable_deals;
create trigger poker_stable_trg_sync_player_package_on_deal
  after insert or update of status, baseline_bankroll, deal_type
  on public.poker_stable_deals
  for each row
  execute function public.poker_stable_trg_sync_player_package_on_deal();

create or replace function public.poker_stable_trg_sync_player_package_on_slice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal_id uuid;
  v_status text;
  v_type text;
begin
  v_deal_id := coalesce(new.deal_id, old.deal_id);
  select d.status, d.deal_type into v_status, v_type
  from public.poker_stable_deals d
  where d.id = v_deal_id;

  if v_type = 'tournament_package' and v_status = 'active' then
    perform public.poker_stable_sync_player_package_contribution(v_deal_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists poker_stable_trg_sync_player_package_on_slice on public.poker_stable_deal_slices;
create trigger poker_stable_trg_sync_player_package_on_slice
  after insert or update of status, action_pct or delete
  on public.poker_stable_deal_slices
  for each row
  execute function public.poker_stable_trg_sync_player_package_on_slice();

-- Close: credit player's roll share; do not use cash "profit above baseline only" path.
create or replace function public.poker_stable_apply_settlement_personal(
  p_settlement_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_st public.poker_stable_deal_settlements%rowtype;
  v_deal public.poker_stable_deals%rowtype;
  v_line record;
  v_player_credit numeric := 0;
  v_staker_credit numeric;
  v_player_net numeric := 0;
  v_line_signed numeric;
  v_is_close boolean := false;
  v_sold numeric;
  v_retained numeric;
  v_return numeric;
begin
  select * into v_st from public.poker_stable_deal_settlements where id = p_settlement_id;
  if v_st.id is null then
    raise exception 'Settlement not found';
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_st.deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  v_is_close := v_deal.status in ('settled', 'closed');

  -- Player (stakee): personal Poker bankroll only.
  if p_user_id = v_deal.stakee_user_id then
    if v_is_close and v_deal.deal_type = 'tournament_package' then
      -- Prefer settle lines (sold action at close); else current active slices.
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
      v_return := public.poker_stable_round_money(
        coalesce(v_st.roll_at_settle, 0) * (v_retained / 100.0)
      );
      if v_return <> 0 then
        perform public.poker_stable_credit_player_personal_bankroll(p_user_id, v_return);
      end if;
      update public.poker_stable_deals
      set player_package_capital = 0
      where id = v_deal.id;
      return;
    end if;

    if coalesce(v_st.profit_above_baseline, 0) > 0 then
      for v_line in
        select l.*
        from public.poker_stable_deal_settlement_lines l
        where l.settlement_id = p_settlement_id
      loop
        v_line_signed := case
          when v_line.direction = 'player_to_staker' then v_line.total_owed
          else -v_line.total_owed
        end;
        v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);
      end loop;

      v_player_net := public.poker_stable_round_money(coalesce(v_st.profit_above_baseline, 0) + v_player_net);
      v_player_credit := case when coalesce(v_st.profit_above_baseline, 0) > 0 then v_player_net else 0 end;
    end if;

    if v_player_credit <> 0 then
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (p_user_id, v_player_credit)
      on conflict (user_id) do update
        set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
    end if;

    return;
  end if;

  -- Backer close: return roll share + book stake P/L (markup fee already realized on accept).
  if v_is_close then
    perform public.poker_stable_apply_close_backer_books(p_settlement_id, p_user_id);
    return;
  end if;

  -- Backer periodic: Stable backing bankroll + realized P/L from settle lines only.
  for v_line in
    select l.*, s.staker_user_id, s.counterparty_kind
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where l.settlement_id = p_settlement_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
  loop
    v_staker_credit := public.poker_stable_round_money(v_line.profit_share + v_line.rakeback_share);
    if v_line.direction = 'staker_to_player' then
      v_staker_credit := -v_staker_credit;
    end if;
    if v_staker_credit <> 0 then
      perform public.poker_stable_backer_apply_settle(p_user_id, v_staker_credit);
    end if;
  end loop;
end;
$$;

revoke all on function public.poker_stable_deal_active_sold_action_pct(uuid) from public;
revoke all on function public.poker_stable_clear_player_package_contribution(uuid) from public;
revoke all on function public.poker_stable_sync_player_package_contribution(uuid) from public;
grant execute on function public.poker_stable_deal_active_sold_action_pct(uuid) to authenticated;
grant execute on function public.poker_stable_clear_player_package_contribution(uuid) to authenticated;
grant execute on function public.poker_stable_sync_player_package_contribution(uuid) to authenticated;

-- Backfill: active tournament packages already live should debit unsold face now.
do $$
declare
  r record;
begin
  for r in
    select id
    from public.poker_stable_deals
    where deal_type = 'tournament_package'
      and status = 'active'
      and stakee_user_id is not null
  loop
    perform public.poker_stable_sync_player_package_contribution(r.id);
  end loop;
end;
$$;

commit;
