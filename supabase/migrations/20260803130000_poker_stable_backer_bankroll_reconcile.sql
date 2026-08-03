-- Reconcile backing bankroll after mistaken pending allocation credits/debits.
-- Target: manual deposits/withdrawals ± settlements − active stake deploy only.
-- Pending stakes stay as holds (not subtracted from backing bankroll balance).

begin;

-- Seed missing manual ledger for @edgelord (pre-adjustment-log deposit + settle = $55,187.50).
insert into public.poker_stable_backer_bankroll_adjustments (user_id, amount, balance_after, occurred_at)
select
  p.user_id,
  50000,
  55187.50,
  '2026-07-15T12:00:00Z'
from public.profiles p
where lower(trim(p.handle)) = 'edgelord'
  and not exists (
    select 1
    from public.poker_stable_backer_bankroll_adjustments adj
    where adj.user_id = p.user_id
  );

create or replace function public.poker_stable_backing_bankroll_from_ledger(p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manual numeric;
  v_realized numeric;
  v_active_debited numeric;
begin
  if p_user_id is null then
    return 0;
  end if;

  select coalesce(sum(a.amount), 0)
  into v_manual
  from public.poker_stable_backer_bankroll_adjustments a
  where a.user_id = p_user_id;

  select coalesce(b.realized_backing_pl, 0)
  into v_realized
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  select coalesce(sum(al.amount), 0)
  into v_active_debited
  from public.poker_stable_backer_allocations al
  inner join public.poker_stable_deals d on d.id = al.deal_id
  where al.user_id = p_user_id
    and d.status = 'active'
    and al.bankroll_debited;

  return public.poker_stable_round_money(v_manual + v_realized - v_active_debited);
end;
$$;

-- Users with manual adjustment history: authoritative ledger formula.
update public.poker_stable_backer_bankrolls b
set bankroll_balance = public.poker_stable_backing_bankroll_from_ledger(b.user_id)
where exists (
  select 1
  from public.poker_stable_backer_bankroll_adjustments a
  where a.user_id = b.user_id
);

-- Legacy rows without adjustment history: undo 20260803120000 pending credit only.
update public.poker_stable_backer_bankrolls b
set bankroll_balance = public.poker_stable_round_money(
  b.bankroll_balance - cred.total
)
from (
  select a.user_id, sum(a.amount) as total
  from public.poker_stable_backer_allocations a
  inner join public.poker_stable_deals d on d.id = a.deal_id
  where d.status = 'pending'
  group by a.user_id
) cred
where b.user_id = cred.user_id
  and b.bankroll_balance >= cred.total
  and not exists (
    select 1
    from public.poker_stable_backer_bankroll_adjustments a
    where a.user_id = b.user_id
  );

revoke all on function public.poker_stable_backing_bankroll_from_ledger(uuid) from public;

commit;
