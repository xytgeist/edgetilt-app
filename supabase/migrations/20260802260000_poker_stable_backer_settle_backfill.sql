-- Backfill pre-20260802230000 backer settle economics into poker_stable_backer_bankrolls.
-- Old poker_stable_apply_settlement (no commit) credited ALL stakers' personal bankroll immediately.
-- Commit-sync era (pre-routing) credited personal on record/sync via apply_settlement_personal.
-- This migration moves those amounts to backer bankroll + realized_backing_pl and reverses personal mis-posts.
-- Idempotent: poker_stable_backer_settle_backfill_applied tracks each settlement line once.

begin;

create table if not exists public.poker_stable_backer_settle_backfill_applied (
  settlement_line_id uuid primary key
    references public.poker_stable_deal_settlement_lines(id) on delete cascade,
  backer_user_id     uuid not null references auth.users(id) on delete cascade,
  amount             numeric(12, 2) not null,
  reversed_personal  boolean not null default false,
  applied_at         timestamptz not null default now()
);

create index if not exists poker_stable_backer_settle_backfill_user_idx
  on public.poker_stable_backer_settle_backfill_applied (backer_user_id, applied_at desc);

do $$
declare
  v_line record;
  v_credit numeric;
  v_backer uuid;
  v_has_commit boolean;
  v_reverse_personal boolean;
begin
  for v_line in
    select
      l.id as line_id,
      l.settlement_id,
      l.profit_share,
      l.rakeback_share,
      l.direction,
      s.staker_user_id
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and not exists (
        select 1
        from public.poker_stable_backer_settle_backfill_applied b
        where b.settlement_line_id = l.id
      )
    order by l.created_at, l.id
  loop
    v_backer := v_line.staker_user_id;

    v_credit := public.poker_stable_round_money(
      coalesce(v_line.profit_share, 0) + coalesce(v_line.rakeback_share, 0)
    );
    if v_line.direction = 'staker_to_player' then
      v_credit := public.poker_stable_round_money(-v_credit);
    end if;

    if v_credit = 0 then
      continue;
    end if;

    select exists (
      select 1
      from public.poker_stable_deal_commits c
      where c.ref_id = v_line.settlement_id
        and c.event_kind in ('periodic_settle', 'close_settle')
    )
    into v_has_commit;

    if not v_has_commit then
      -- Legacy immediate apply_settlement: personal bankroll credited for every backer slice at settle time.
      v_reverse_personal := true;
    else
      select exists (
        select 1
        from public.poker_stable_deal_commits c
        where c.ref_id = v_line.settlement_id
          and c.event_kind in ('periodic_settle', 'close_settle')
          and c.recorded_by_user_id = v_backer
      )
      or exists (
        select 1
        from public.poker_stable_deal_commits c
        join public.poker_stable_commit_syncs cs on cs.commit_id = c.id
        where c.ref_id = v_line.settlement_id
          and c.event_kind in ('periodic_settle', 'close_settle')
          and cs.user_id = v_backer
      )
      into v_reverse_personal;
    end if;

    perform public.poker_stable_backer_apply_settle(v_backer, v_credit);

    if v_reverse_personal then
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (v_backer, 0)
      on conflict (user_id) do nothing;

      update public.poker_bankroll_profiles
      set overall_bankroll = public.poker_stable_round_money(overall_bankroll - v_credit)
      where user_id = v_backer;
    end if;

    insert into public.poker_stable_backer_settle_backfill_applied (
      settlement_line_id,
      backer_user_id,
      amount,
      reversed_personal
    )
    values (v_line.line_id, v_backer, v_credit, v_reverse_personal);
  end loop;
end;
$$;

comment on table public.poker_stable_backer_settle_backfill_applied is
  'One row per settlement line backfilled from pre-20260802230000 personal bankroll routing into poker_stable_backer_bankrolls.';

commit;
