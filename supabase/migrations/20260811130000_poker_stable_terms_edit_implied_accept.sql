-- Editing/proposing terms is an implied acceptance if the counterparty accepts.
--   Lead Accept counter → deal goes active (player already accepted by proposing).
--   Player Accept backer proposal → proposing backer's slice goes active.

begin;

create or replace function public.poker_stable_staker_accept_counter_terms(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  d public.poker_stable_deals;
  payload jsonb;
  deal_part jsonb;
  slices_part jsonb;
  v_slice jsonb;
  v_idx integer := 0;
  v_kind text;
  v_staker uuid;
  v_detail text;
  v_action numeric;
  v_pricing text;
  v_rakeback text;
  v_roll numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into d
  from public.poker_stable_deals
  where id = p_deal_id
    and staker_user_id = v_uid
    and status = 'pending'
    and staker_terms_ack_required = true
  for update;

  if not found or d.pending_terms_json is null then
    raise exception 'No counter-proposal to accept';
  end if;

  v_detail := coalesce(d.label, 'Backing stake');
  payload := d.pending_terms_json;
  deal_part := coalesce(payload->'deal', '{}'::jsonb);
  slices_part := coalesce(payload->'slices', '[]'::jsonb);

  perform public.poker_stable_assert_json_slices_action_cap(slices_part);

  update public.poker_stable_deals
  set
    label = coalesce(nullif(btrim(deal_part->>'label'), ''), label),
    baseline_bankroll = coalesce((deal_part->>'baseline_bankroll')::numeric, baseline_bankroll),
    starting_roll = coalesce((deal_part->>'starting_roll')::numeric, starting_roll),
    is_migration = coalesce((deal_part->>'is_migration')::boolean, is_migration),
    stake_wide_starting_pl = case
      when deal_part ? 'stake_wide_starting_pl' then (deal_part->>'stake_wide_starting_pl')::numeric
      else stake_wide_starting_pl
    end,
    lifetime_pl_display = case
      when deal_part ? 'lifetime_pl_display' then (deal_part->>'lifetime_pl_display')::numeric
      else lifetime_pl_display
    end,
    -- Player implied acceptance by proposing these terms.
    status = 'active',
    responded_at = now(),
    pending_terms_json = null,
    staker_terms_ack_required = false,
    stakee_terms_ack_required = false,
    terms_revised_at = null,
    terms_revised_by = null
  where id = p_deal_id
  returning coalesce(nullif(starting_roll, 0), baseline_bankroll, 0) into v_roll;

  if jsonb_typeof(slices_part) = 'array' and jsonb_array_length(slices_part) > 0 then
    delete from public.poker_stable_deal_slices where deal_id = p_deal_id;

    for v_slice in select value from jsonb_array_elements(slices_part)
    loop
      v_kind := coalesce(
        v_slice->>'counterparty_kind',
        v_slice->>'counterpartyKind',
        'guest'
      );
      v_staker := coalesce(
        nullif(v_slice->>'staker_user_id', '')::uuid,
        nullif(v_slice->>'stakerUserId', '')::uuid
      );
      v_action := public.poker_stable_json_slice_action_pct(v_slice);
      v_pricing := coalesce(v_slice->>'pricing_mode', v_slice->>'pricingMode');
      v_rakeback := coalesce(v_slice->>'rakeback_mode', v_slice->>'rakebackMode', 'disabled');

      insert into public.poker_stable_deal_slices (
        deal_id,
        slice_index,
        counterparty_kind,
        staker_user_id,
        guest_label,
        guest_phone,
        guest_email,
        action_pct,
        pricing_mode,
        player_profit_pct,
        markup_rate,
        rakeback_mode,
        rakeback_player_pct,
        status,
        responded_at,
        label
      ) values (
        p_deal_id,
        v_idx,
        v_kind,
        v_staker,
        nullif(btrim(coalesce(v_slice->>'guest_label', v_slice->>'guestLabel')), ''),
        nullif(btrim(coalesce(v_slice->>'guest_phone', v_slice->>'guestPhone')), ''),
        nullif(lower(btrim(coalesce(v_slice->>'guest_email', v_slice->>'guestEmail'))), ''),
        v_action,
        v_pricing,
        case
          when v_pricing = 'profit_split' then coalesce(
            (v_slice->>'player_profit_pct')::numeric,
            (v_slice->>'playerProfitPct')::numeric
          )
          else null
        end,
        case
          when v_pricing = 'markup' then coalesce(
            (v_slice->>'markup_rate')::numeric,
            (v_slice->>'markupRate')::numeric
          )
          else null
        end,
        v_rakeback,
        case
          when v_rakeback = 'custom' then coalesce(
            (v_slice->>'rakeback_player_pct')::numeric,
            (v_slice->>'rakebackPlayerPct')::numeric
          )
          else null
        end,
        case
          when v_kind = 'guest' then 'active'
          when v_staker = v_uid then 'active'
          else 'pending'
        end,
        case
          when v_kind = 'guest' or v_staker = v_uid then now()
          else null
        end,
        nullif(btrim(v_slice->>'label'), '')
      );
      v_idx := v_idx + 1;
    end loop;
  end if;

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, coalesce(v_roll, 0))
  on conflict (deal_id) do update
  set overall_bankroll = excluded.overall_bankroll;

  perform public.poker_stable_notify_stakee(
    p_deal_id,
    v_uid,
    'poker_stable_staker_counter_accepted',
    v_detail
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'active');
end;
$fn$;

comment on function public.poker_stable_staker_accept_counter_terms(uuid) is
  'Lead accepts stakee counter-proposal, applies terms, and activates the deal (player implied accept).';

-- Player accepts backer-proposed terms; proposing backer slice auto-activates.
create or replace function public.poker_stable_stakee_accept_proposed_terms(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  d public.poker_stable_deals;
  payload jsonb;
  deal_part jsonb;
  slices_part jsonb;
  v_slice jsonb;
  v_idx integer := 0;
  v_kind text;
  v_staker uuid;
  v_reviser uuid;
  v_action numeric;
  v_pricing text;
  v_rakeback text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into d
  from public.poker_stable_deals
  where id = p_deal_id
    and stakee_user_id = v_uid
    and status = 'pending'
    and stakee_terms_ack_required = true
  for update;

  if not found or d.pending_terms_json is null then
    raise exception 'No proposed terms to accept';
  end if;

  v_reviser := d.terms_revised_by;
  payload := d.pending_terms_json;
  deal_part := coalesce(payload->'deal', '{}'::jsonb);
  slices_part := coalesce(payload->'slices', '[]'::jsonb);

  perform public.poker_stable_assert_json_slices_action_cap(slices_part);

  update public.poker_stable_deals
  set
    label = coalesce(nullif(btrim(deal_part->>'label'), ''), label),
    baseline_bankroll = coalesce((deal_part->>'baseline_bankroll')::numeric, baseline_bankroll),
    starting_roll = coalesce((deal_part->>'starting_roll')::numeric, starting_roll),
    is_migration = coalesce((deal_part->>'is_migration')::boolean, is_migration),
    stake_wide_starting_pl = case
      when deal_part ? 'stake_wide_starting_pl' then (deal_part->>'stake_wide_starting_pl')::numeric
      else stake_wide_starting_pl
    end,
    lifetime_pl_display = case
      when deal_part ? 'lifetime_pl_display' then (deal_part->>'lifetime_pl_display')::numeric
      else lifetime_pl_display
    end,
    pending_terms_json = null,
    staker_terms_ack_required = false,
    stakee_terms_ack_required = false,
    terms_revised_at = null,
    terms_revised_by = null
  where id = p_deal_id;

  if jsonb_typeof(slices_part) = 'array' and jsonb_array_length(slices_part) > 0 then
    perform set_config('poker_stable.suppress_slice_invite', '1', true);
    delete from public.poker_stable_deal_slices where deal_id = p_deal_id;

    for v_slice in select value from jsonb_array_elements(slices_part)
    loop
      v_kind := coalesce(
        v_slice->>'counterparty_kind',
        v_slice->>'counterpartyKind',
        'guest'
      );
      v_staker := coalesce(
        nullif(v_slice->>'staker_user_id', '')::uuid,
        nullif(v_slice->>'stakerUserId', '')::uuid
      );
      v_action := public.poker_stable_json_slice_action_pct(v_slice);
      v_pricing := coalesce(v_slice->>'pricing_mode', v_slice->>'pricingMode');
      v_rakeback := coalesce(v_slice->>'rakeback_mode', v_slice->>'rakebackMode', 'disabled');

      insert into public.poker_stable_deal_slices (
        deal_id,
        slice_index,
        counterparty_kind,
        staker_user_id,
        guest_label,
        guest_phone,
        guest_email,
        action_pct,
        pricing_mode,
        player_profit_pct,
        markup_rate,
        rakeback_mode,
        rakeback_player_pct,
        status,
        responded_at,
        label
      ) values (
        p_deal_id,
        v_idx,
        v_kind,
        v_staker,
        nullif(btrim(coalesce(v_slice->>'guest_label', v_slice->>'guestLabel')), ''),
        nullif(btrim(coalesce(v_slice->>'guest_phone', v_slice->>'guestPhone')), ''),
        nullif(lower(btrim(coalesce(v_slice->>'guest_email', v_slice->>'guestEmail'))), ''),
        v_action,
        v_pricing,
        case
          when v_pricing = 'profit_split' then coalesce(
            (v_slice->>'player_profit_pct')::numeric,
            (v_slice->>'playerProfitPct')::numeric
          )
          else null
        end,
        case
          when v_pricing = 'markup' then coalesce(
            (v_slice->>'markup_rate')::numeric,
            (v_slice->>'markupRate')::numeric
          )
          else null
        end,
        v_rakeback,
        case
          when v_rakeback = 'custom' then coalesce(
            (v_slice->>'rakeback_player_pct')::numeric,
            (v_slice->>'rakebackPlayerPct')::numeric
          )
          else null
        end,
        case
          when v_kind = 'guest' then 'active'
          when v_reviser is not null and v_staker = v_reviser then 'active'
          else 'pending'
        end,
        case
          when v_kind = 'guest' or (v_reviser is not null and v_staker = v_reviser) then now()
          else null
        end,
        nullif(btrim(v_slice->>'label'), '')
      );
      v_idx := v_idx + 1;
    end loop;
  elsif v_reviser is not null then
    -- Payload had no slices: still mark the proposing backer's existing slice active.
    update public.poker_stable_deal_slices
    set status = 'active', responded_at = coalesce(responded_at, now())
    where deal_id = p_deal_id
      and staker_user_id = v_reviser
      and status = 'pending';
  end if;

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id);
end;
$fn$;

revoke all on function public.poker_stable_stakee_accept_proposed_terms(uuid) from public;
grant execute on function public.poker_stable_stakee_accept_proposed_terms(uuid) to authenticated;

comment on function public.poker_stable_stakee_accept_proposed_terms(uuid) is
  'Stakee accepts backer-proposed terms and auto-activates the proposing backer slice.';

commit;
