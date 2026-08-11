-- Backer propose activates the proposer slice (implied accept) and used to trip
-- poker_stable_activate_player_deal_on_backer_accept → deal.status = active while
-- stakee_terms_ack_required was still true. That made the horse card show Active
-- and hid player Edit terms (stakeeCanEdit only for pending/guest-only active).
-- Keep the deal pending until the player accepts revised terms.

begin;

create or replace function public.poker_stable_activate_player_deal_on_backer_accept(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deal public.poker_stable_deals%rowtype;
begin
  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id;

  if v_deal.id is null then
    return;
  end if;

  if v_deal.staker_user_id is not null then
    return;
  end if;

  if not exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
  ) then
    return;
  end if;

  -- Revised terms outstanding: slice may be active (implied accept) but deal stays pending.
  if v_deal.stakee_terms_ack_required then
    perform public.poker_stable_ensure_deal_bankroll_profile(p_deal_id);
    return;
  end if;

  if v_deal.status in ('pending', 'draft') then
    update public.poker_stable_deals
    set status = 'active',
        responded_at = coalesce(responded_at, now())
    where id = p_deal_id
      and status in ('pending', 'draft');
  end if;

  perform public.poker_stable_ensure_deal_bankroll_profile(p_deal_id);
end;
$fn$;

comment on function public.poker_stable_activate_player_deal_on_backer_accept(uuid) is
  'Activates player-initiated deal when a backer slice is active, unless revised terms still need stakee ack.';

-- Repair deals that went live too early while a terms proposal was still open.
update public.poker_stable_deals
set
  status = 'pending',
  responded_at = null
where status = 'active'
  and stakee_terms_ack_required = true
  and staker_user_id is null;

commit;
