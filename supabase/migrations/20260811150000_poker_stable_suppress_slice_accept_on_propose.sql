-- Backer propose activates the slice (implied accept) but must NOT emit
-- poker_stable_slice_accepted ... player already gets backer_terms_proposed.

begin;

create or replace function public.poker_stable_slice_response_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_stakee uuid;
  v_deal_staker uuid;
  v_label text;
  v_backer_name text;
  v_detail text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if coalesce(current_setting('poker_stable.suppress_slice_response', true), '') = '1' then
    return new;
  end if;
  if old.status is not distinct from new.status then
    return new;
  end if;
  if old.status <> 'pending' then
    return new;
  end if;
  if new.status not in ('active', 'declined') then
    return new;
  end if;
  if new.counterparty_kind <> 'user' or new.staker_user_id is null then
    return new;
  end if;

  select d.stakee_user_id, d.staker_user_id, d.label
  into v_stakee, v_deal_staker, v_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  if v_stakee is null or v_deal_staker is not null then
    return new;
  end if;

  v_backer_name := coalesce(
    nullif(trim(public.poker_stable_profile_display_name(new.staker_user_id)), ''),
    nullif(trim(public.poker_stable_profile_display_name(new.staker_user_id)), 'User'),
    nullif(trim(new.guest_label), ''),
    'Backer'
  );
  v_detail := v_backer_name || ' · ' || coalesce(v_label, 'Backing stake');

  if new.status = 'active' then
    perform public.poker_stable_emit_activity_event(
      v_stakee,
      new.staker_user_id,
      'poker_stable_slice_accepted',
      new.deal_id,
      null,
      v_detail
    );
  elsif new.status = 'declined' then
    perform public.poker_stable_emit_activity_event(
      v_stakee,
      new.staker_user_id,
      'poker_stable_slice_declined',
      new.deal_id,
      null,
      v_detail
    );
  end if;

  return new;
end;
$fn$;

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

  -- Activate slice without poker_stable_slice_accepted (terms_proposed notify covers it).
  perform set_config('poker_stable.suppress_slice_response', '1', true);

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
  'Backer proposes revised terms; activates proposer slice without slice_accepted Alert.';

commit;
