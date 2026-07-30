-- Soft-event picker expiry: keep events with recent logging activity (Day 2 / late reg)
-- even when event_date is older than yesterday.

begin;

alter table public.poker_tournament_events
  add column if not exists last_activity_at timestamptz;

update public.poker_tournament_events
set last_activity_at = coalesce(updated_at, created_at, now())
where last_activity_at is null;

alter table public.poker_tournament_events
  alter column last_activity_at set default now();

alter table public.poker_tournament_events
  alter column last_activity_at set not null;

create index if not exists poker_tournament_events_last_activity_idx
  on public.poker_tournament_events (last_activity_at desc);

create or replace function public.poker_tournament_event_bump_activity(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id is null then
    return;
  end if;
  update public.poker_tournament_events
  set last_activity_at = now(),
      updated_at = now()
  where id = p_event_id;
exception
  when others then
    raise warning 'poker_tournament_event_bump_activity: %', sqlerrm;
end;
$$;

revoke all on function public.poker_tournament_event_bump_activity(uuid) from public;
grant execute on function public.poker_tournament_event_bump_activity(uuid) to authenticated, service_role;

create or replace function public.poker_tournament_events_bump_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.poker_tournament_event_bump_activity(new.tournament_event_id);
  elsif tg_op = 'UPDATE' then
    if new.tournament_event_id is distinct from old.tournament_event_id then
      perform public.poker_tournament_event_bump_activity(new.tournament_event_id);
      -- Keep old event warm briefly when unlinking is rare; still bump new.
    elsif new.tournament_event_id is not null
      and (
        new.start_at is distinct from old.start_at
        or new.end_at is distinct from old.end_at
        or new.status is distinct from old.status
        or new.cash_out is distinct from old.cash_out
      )
    then
      perform public.poker_tournament_event_bump_activity(new.tournament_event_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists poker_bankroll_sessions_bump_tournament_event
  on public.poker_bankroll_sessions;
create trigger poker_bankroll_sessions_bump_tournament_event
  after insert or update of tournament_event_id, start_at, end_at, status, cash_out
  on public.poker_bankroll_sessions
  for each row
  execute function public.poker_tournament_events_bump_from_session();

create or replace function public.poker_tournament_events_bump_from_swap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.poker_tournament_event_bump_activity(new.tournament_event_id);
  elsif tg_op = 'UPDATE' then
    if new.tournament_event_id is distinct from old.tournament_event_id
      or new.status is distinct from old.status
      or new.settlement_amount is distinct from old.settlement_amount
      or new.creator_result_ready is distinct from old.creator_result_ready
      or new.counterparty_result_ready is distinct from old.counterparty_result_ready
    then
      perform public.poker_tournament_event_bump_activity(new.tournament_event_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists poker_tournament_swaps_bump_tournament_event
  on public.poker_tournament_swaps;
create trigger poker_tournament_swaps_bump_tournament_event
  after insert or update of tournament_event_id, status, settlement_amount,
    creator_result_ready, counterparty_result_ready
  on public.poker_tournament_swaps
  for each row
  execute function public.poker_tournament_events_bump_from_swap();

comment on column public.poker_tournament_events.last_activity_at is
  'Bumped when sessions/swaps link or update this event. Soft picker keeps rows with activity in last 36h even if event_date is older.';

commit;
