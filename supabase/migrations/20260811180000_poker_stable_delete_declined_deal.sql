-- Initiator may hard-delete a fully declined stake (other side declined the offer).
-- Used by Delete / New Proposal on the initiator's carousel card.

begin;

create or replace function public.poker_stable_delete_declined_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id
  for update;

  if v_deal.id is null then
    raise exception 'Stake not found';
  end if;

  if v_deal.status <> 'declined' then
    raise exception 'Only declined stakes can be deleted this way';
  end if;

  -- Player-initiated: stakee owns the offer (staker_user_id null).
  -- Backer-initiated: lead backer owns the offer.
  if not (
    (v_deal.staker_user_id is null and v_deal.stakee_user_id = v_uid)
    or (v_deal.staker_user_id is not null and v_deal.staker_user_id = v_uid)
  ) then
    raise exception 'Only the stake initiator can delete this declined offer';
  end if;

  -- Sessions detach to personal (keep history); deal row goes away.
  update public.poker_bankroll_sessions
  set deal_id = null
  where deal_id = p_deal_id;

  delete from public.activity_events
  where poker_stable_deal_id = p_deal_id;

  delete from public.poker_stable_deals
  where id = p_deal_id;
end;
$fn$;

comment on function public.poker_stable_delete_declined_deal(uuid) is
  'Initiator hard-deletes a declined stake offer (Delete / New Proposal).';

revoke all on function public.poker_stable_delete_declined_deal(uuid) from public;
grant execute on function public.poker_stable_delete_declined_deal(uuid) to authenticated;

commit;
