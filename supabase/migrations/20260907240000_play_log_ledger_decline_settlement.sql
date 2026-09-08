-- Play Logbook ledger: counterpart can Remain Unsettled instead of Update my books.
-- Plays stay open on their books. Actor already closed theirs.

alter table public.play_log_ledger_settlements
  add column if not exists counterpart_declined_at timestamptz;

comment on column public.play_log_ledger_settlements.counterpart_declined_at is
  'When the counterpart chose Remain Unsettled. Null means they have not dismissed Update my books.';

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
  set
    counterpart_accepted_at = now(),
    counterpart_declined_at = null
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

create or replace function public.play_log_ledger_decline_settlement(p_id uuid)
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
  set counterpart_declined_at = coalesce(s.counterpart_declined_at, now())
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

comment on function public.play_log_ledger_decline_settlement(uuid) is
  'Counterpart remains unsettled: dismiss Update my books, keep plays open on their ledger.';

revoke all on function public.play_log_ledger_decline_settlement(uuid) from public;
grant execute on function public.play_log_ledger_decline_settlement(uuid) to authenticated;

notify pgrst, 'reload schema';
