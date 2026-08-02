-- Backer Stable bankroll pool (separate from poker_bankroll_profiles personal play).
-- Optional allocations debit pool when backer has set a balance.

begin;

create table if not exists public.poker_stable_backer_bankrolls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bankroll_balance numeric(12, 2) not null default 0,
  realized_backing_pl numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists poker_stable_backer_bankrolls_updated_at on public.poker_stable_backer_bankrolls;
create trigger poker_stable_backer_bankrolls_updated_at
  before update on public.poker_stable_backer_bankrolls
  for each row execute function public.set_updated_at();

create table if not exists public.poker_stable_backer_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid not null references public.poker_stable_deals(id) on delete cascade,
  slice_id uuid not null references public.poker_stable_deal_slices(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'released')),
  created_at timestamptz not null default now(),
  constraint poker_stable_backer_allocations_slice_unique unique (slice_id)
);

create index if not exists poker_stable_backer_allocations_user_idx
  on public.poker_stable_backer_allocations (user_id, status);

alter table public.poker_stable_backer_bankrolls enable row level security;
alter table public.poker_stable_backer_allocations enable row level security;

drop policy if exists "poker_stable_backer_bankrolls_select" on public.poker_stable_backer_bankrolls;
create policy "poker_stable_backer_bankrolls_select"
  on public.poker_stable_backer_bankrolls for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "poker_stable_backer_allocations_select" on public.poker_stable_backer_allocations;
create policy "poker_stable_backer_allocations_select"
  on public.poker_stable_backer_allocations for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.poker_stable_backer_bankrolls to authenticated;
grant select on public.poker_stable_backer_allocations to authenticated;

create or replace function public.poker_stable_slice_allocation_amount(
  p_deal_id uuid,
  p_action_pct numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_baseline numeric;
begin
  select coalesce(d.baseline_bankroll, 0) into v_baseline
  from public.poker_stable_deals d
  where d.id = p_deal_id;

  return public.poker_stable_round_money(coalesce(v_baseline, 0) * (coalesce(p_action_pct, 0) / 100));
end;
$$;

create or replace function public.poker_stable_ensure_backer_allocation(
  p_slice_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_amount numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
begin
  select * into v_slice from public.poker_stable_deal_slices where id = p_slice_id;
  if v_slice.id is null then
    return;
  end if;
  if v_slice.counterparty_kind <> 'user' or v_slice.staker_user_id is null then
    return;
  end if;
  if v_slice.status not in ('pending', 'active') then
    return;
  end if;

  v_target_status := case when v_slice.status = 'active' then 'active' else 'pending' end;
  v_amount := public.poker_stable_slice_allocation_amount(v_slice.deal_id, v_slice.action_pct);

  select * into v_existing
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id;

  if v_existing.id is not null then
    if v_existing.status <> v_target_status and v_target_status = 'active' then
      update public.poker_stable_backer_allocations
      set status = 'active'
      where id = v_existing.id;
    end if;
    return;
  end if;

  insert into public.poker_stable_backer_allocations (
    user_id, deal_id, slice_id, amount, status
  )
  values (
    v_slice.staker_user_id,
    v_slice.deal_id,
    p_slice_id,
    v_amount,
    v_target_status
  );

  if v_amount > 0 and exists (
    select 1 from public.poker_stable_backer_bankrolls b
    where b.user_id = v_slice.staker_user_id
      and b.bankroll_balance >= v_amount
  ) then
    update public.poker_stable_backer_bankrolls
    set bankroll_balance = public.poker_stable_round_money(bankroll_balance - v_amount)
    where user_id = v_slice.staker_user_id;
  end if;
end;
$$;

create or replace function public.poker_stable_set_backer_bankroll(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt < 0 then
    raise exception 'Enter a non-negative amount.';
  end if;

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance)
  values (v_uid, v_amt)
  on conflict (user_id) do update
    set bankroll_balance = excluded.bankroll_balance;

  return jsonb_build_object('bankroll_balance', v_amt);
end;
$$;

create or replace function public.poker_stable_get_backer_bankroll()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.poker_stable_backer_bankrolls%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row from public.poker_stable_backer_bankrolls where user_id = v_uid;
  if v_row.user_id is null then
    return jsonb_build_object(
      'bankroll_balance', 0,
      'realized_backing_pl', 0,
      'has_profile', false
    );
  end if;

  return jsonb_build_object(
    'bankroll_balance', v_row.bankroll_balance,
    'realized_backing_pl', v_row.realized_backing_pl,
    'has_profile', true
  );
end;
$$;

create or replace function public.poker_stable_backer_credit_realized_pl(
  p_user_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
begin
  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt = 0 or p_user_id is null then
    return;
  end if;

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance, realized_backing_pl)
  values (p_user_id, v_amt, v_amt)
  on conflict (user_id) do update
    set bankroll_balance = public.poker_stable_round_money(poker_stable_backer_bankrolls.bankroll_balance + v_amt),
        realized_backing_pl = public.poker_stable_round_money(poker_stable_backer_bankrolls.realized_backing_pl + v_amt);
end;
$$;

-- Hook allocations when slices are created/activated (no-op if backer has no bankroll row yet).
create or replace function public.poker_stable_backer_allocation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.counterparty_kind = 'user'
     and new.staker_user_id is not null
     and new.status in ('pending', 'active') then
    perform public.poker_stable_ensure_backer_allocation(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists poker_stable_deal_slices_backer_allocation on public.poker_stable_deal_slices;
create trigger poker_stable_deal_slices_backer_allocation
  after insert or update of status, action_pct, staker_user_id
  on public.poker_stable_deal_slices
  for each row execute function public.poker_stable_backer_allocation_trigger();

revoke all on function public.poker_stable_set_backer_bankroll(numeric) from public;
revoke all on function public.poker_stable_get_backer_bankroll() from public;

grant execute on function public.poker_stable_set_backer_bankroll(numeric) to authenticated;
grant execute on function public.poker_stable_get_backer_bankroll() to authenticated;

commit;
