-- Stake roll must refresh when on-stake sessions are deleted (purge / raw delete).
-- Insert/update already refresh via poker_stable_sessions_refresh_deal_roll.

begin;

create or replace function public.poker_stable_sessions_refresh_deal_roll_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deal_id is null then
    return old;
  end if;
  perform public.poker_stable_ensure_deal_bankroll_profile(old.deal_id);
  return old;
end;
$$;

comment on function public.poker_stable_sessions_refresh_deal_roll_on_delete() is
  'After deleting an on-stake session, recompute deal roll from remaining sessions.';

drop trigger if exists poker_stable_sessions_refresh_deal_roll_del on public.poker_bankroll_sessions;
create trigger poker_stable_sessions_refresh_deal_roll_del
  after delete on public.poker_bankroll_sessions
  for each row
  when (old.deal_id is not null)
  execute function public.poker_stable_sessions_refresh_deal_roll_on_delete();

commit;
