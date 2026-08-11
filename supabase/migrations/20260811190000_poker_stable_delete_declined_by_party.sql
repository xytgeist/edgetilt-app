-- Allow any party on a declined deal (stakee or Edge slice staker) to hard-delete it.
-- Used when the decliner chooses Propose new terms so the initiator's declined card goes away.

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
  v_allowed boolean := false;
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

  if v_deal.stakee_user_id = v_uid then
    v_allowed := true;
  elsif v_deal.staker_user_id is not null and v_deal.staker_user_id = v_uid then
    v_allowed := true;
  elsif exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.staker_user_id = v_uid
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'You cannot delete this declined offer';
  end if;

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
  'Hard-delete a declined stake offer (initiator Delete, or decliner Propose new terms).';

commit;
