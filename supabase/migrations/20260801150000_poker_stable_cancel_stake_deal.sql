-- Stakee may delete a stake before any Edge backer has accepted their slice.

create or replace function public.poker_stable_cancel_stake_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.status
  into v_status
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status in ('pending', 'active');

  if v_status is null then
    raise exception 'You cannot delete this stake';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.counterparty_kind = 'user'
      and s.status = 'active'
  ) then
    raise exception 'Cannot delete after an Edge backer has accepted';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_settlements
    where deal_id = p_deal_id
  ) then
    raise exception 'Cannot delete a stake that has been settled';
  end if;

  delete from public.poker_bankroll_sessions
  where deal_id = p_deal_id
    and user_id = v_uid;

  delete from public.poker_stable_deals
  where id = p_deal_id
    and stakee_user_id = v_uid;
end;
$$;

revoke all on function public.poker_stable_cancel_stake_deal(uuid) from public;
grant execute on function public.poker_stable_cancel_stake_deal(uuid) to authenticated;
