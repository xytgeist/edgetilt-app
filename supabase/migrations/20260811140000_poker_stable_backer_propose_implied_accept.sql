-- Backer Edit terms = implied slice accept. Activate proposer's slice on send.
-- If the player declines the proposal, re-pend that slice so they are not stuck accepted.

begin;

create or replace function public.poker_stable_propose_terms(p_deal_id uuid, p_terms jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_terms is null or jsonb_typeof(p_terms) <> 'object' then
    raise exception 'Invalid terms payload';
  end if;

  perform public.poker_stable_assert_json_slices_action_cap(p_terms->'slices');

  if not exists (
    select 1
    from public.poker_stable_deals d
    join public.poker_stable_deal_slices s on s.deal_id = d.id
    where d.id = p_deal_id
      and d.status = 'pending'
      and s.staker_user_id = v_uid
      and s.status = 'pending'
  ) then
    raise exception 'You cannot propose terms on this deal';
  end if;

  update public.poker_stable_deals
  set
    pending_terms_json = p_terms,
    stakee_terms_ack_required = true,
    staker_terms_ack_required = false,
    terms_revised_at = now(),
    terms_revised_by = v_uid
  where id = p_deal_id
    and status = 'pending'
  returning coalesce(label, 'Backing stake') into v_detail;

  -- Implied acceptance of the terms being proposed.
  update public.poker_stable_deal_slices
  set
    status = 'active',
    responded_at = coalesce(responded_at, now())
  where deal_id = p_deal_id
    and staker_user_id = v_uid
    and status = 'pending';

  perform public.poker_stable_notify_stakee(
    p_deal_id,
    v_uid,
    'poker_stable_backer_terms_proposed',
    v_detail
  );
end;
$fn$;

comment on function public.poker_stable_propose_terms(uuid, jsonb) is
  'Backer proposes revised terms; proposer slice activates immediately (implied accept).';

create or replace function public.poker_stable_clear_proposed_terms(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_reviser uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.terms_revised_by
  into v_reviser
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.status = 'pending'
    and d.stakee_terms_ack_required = true
    and (
      d.stakee_user_id = v_uid
      or exists (
        select 1
        from public.poker_stable_deal_slices s
        where s.deal_id = d.id
          and s.staker_user_id = v_uid
      )
    )
  for update;

  if not found then
    return;
  end if;

  update public.poker_stable_deals
  set
    pending_terms_json = null,
    stakee_terms_ack_required = false,
    terms_revised_at = null,
    terms_revised_by = null
  where id = p_deal_id
    and status = 'pending';

  -- Player declined the revision: proposer is no longer accepted on those terms.
  if v_reviser is not null then
    update public.poker_stable_deal_slices
    set
      status = 'pending',
      responded_at = null
    where deal_id = p_deal_id
      and staker_user_id = v_reviser
      and status = 'active';
  end if;
end;
$fn$;

comment on function public.poker_stable_clear_proposed_terms(uuid) is
  'Clears a backer terms proposal and re-pends the proposer slice.';

-- Repair in-flight proposals: proposer already sent revised terms but slice still pending.
update public.poker_stable_deal_slices s
set
  status = 'active',
  responded_at = coalesce(s.responded_at, now())
from public.poker_stable_deals d
where s.deal_id = d.id
  and d.status = 'pending'
  and d.stakee_terms_ack_required = true
  and d.terms_revised_by is not null
  and s.staker_user_id = d.terms_revised_by
  and s.status = 'pending';

commit;
