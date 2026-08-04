-- Allow active backers (not only the player) to nudge pending co-backer slices.

create or replace function public.poker_stable_nudge_backer_slice(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slice record;
  v_detail text;
  v_can_nudge boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select
    s.id,
    s.deal_id,
    s.counterparty_kind,
    s.staker_user_id,
    s.status,
    s.label,
    d.stakee_user_id,
    d.label as deal_label,
    d.status as deal_status
  into v_slice
  from public.poker_stable_deal_slices s
  join public.poker_stable_deals d on d.id = s.deal_id
  where s.id = p_slice_id;

  if v_slice.id is null then
    raise exception 'Slice not found';
  end if;

  if v_slice.stakee_user_id = v_uid then
    v_can_nudge := true;
  elsif exists (
    select 1
    from public.poker_stable_deal_slices s2
    where s2.deal_id = v_slice.deal_id
      and s2.staker_user_id = v_uid
      and s2.status = 'active'
  ) then
    v_can_nudge := true;
  end if;

  if not v_can_nudge then
    raise exception 'Not authorized to nudge this slice';
  end if;

  if v_slice.staker_user_id = v_uid then
    raise exception 'Cannot nudge your own slice';
  end if;

  if v_slice.deal_status not in ('pending', 'active') then
    raise exception 'Stake is not open';
  end if;
  if v_slice.status <> 'pending' then
    raise exception 'Backer has already responded';
  end if;

  v_detail := coalesce(nullif(trim(v_slice.label), ''), nullif(trim(v_slice.deal_label), ''), 'Backing invite');

  if v_slice.counterparty_kind = 'user' and v_slice.staker_user_id is not null then
    perform public.poker_stable_emit_activity_event(
      v_slice.staker_user_id,
      v_uid,
      'poker_stable_slice_nudge',
      v_slice.deal_id,
      null,
      v_detail
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'slice_id', p_slice_id,
    'deal_id', v_slice.deal_id,
    'counterparty_kind', v_slice.counterparty_kind
  );
end;
$$;

comment on function public.poker_stable_nudge_backer_slice(uuid) is
  'Player or any active backer on the deal reminds a pending co-backer to accept their slice (Edge activity; guest notify via client).';
