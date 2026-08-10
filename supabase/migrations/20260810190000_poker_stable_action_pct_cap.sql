-- Enforce total sold action ≤ 100% on create/edit. Client already intended this
-- via sumSliceActionPct, but form payloads use actionPct while the helper only
-- read action_pct (sum always 0). DB deferred trigger closes the hole; propose
-- RPCs assert before storing pending terms.

begin;

create or replace function public.poker_stable_json_slice_action_pct(p_slice jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(
    nullif(p_slice->>'action_pct', '')::numeric,
    nullif(p_slice->>'actionPct', '')::numeric,
    0
  );
$$;

create or replace function public.poker_stable_assert_json_slices_action_cap(p_slices jsonb)
returns void
language plpgsql
stable
as $$
declare
  v_total numeric := 0;
  v_slice jsonb;
begin
  if p_slices is null or jsonb_typeof(p_slices) <> 'array' then
    return;
  end if;
  for v_slice in select value from jsonb_array_elements(p_slices)
  loop
    v_total := v_total + public.poker_stable_json_slice_action_pct(v_slice);
  end loop;
  if v_total > 100.001 then
    raise exception 'Total action sold cannot exceed 100%%';
  end if;
end;
$$;

create or replace function public.poker_stable_deal_slices_action_cap_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal_id uuid;
  v_total numeric;
begin
  v_deal_id := coalesce(NEW.deal_id, OLD.deal_id);
  if v_deal_id is null then
    return null;
  end if;

  select coalesce(sum(s.action_pct), 0)
  into v_total
  from public.poker_stable_deal_slices s
  where s.deal_id = v_deal_id
    and s.status not in ('declined', 'cancelled');

  if v_total > 100.001 then
    raise exception 'Total action sold cannot exceed 100%%';
  end if;

  return null;
end;
$$;

drop trigger if exists poker_stable_deal_slices_action_cap on public.poker_stable_deal_slices;

create constraint trigger poker_stable_deal_slices_action_cap
  after insert or update of action_pct, status or delete
  on public.poker_stable_deal_slices
  deferrable initially deferred
  for each row
  execute function public.poker_stable_deal_slices_action_cap_trg();

create or replace function public.poker_stable_propose_terms(p_deal_id uuid, p_terms jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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
    terms_revised_at = now(),
    terms_revised_by = v_uid
  where id = p_deal_id
    and status = 'pending';
end;
$$;

create or replace function public.poker_stable_stakee_propose_counter_terms(
  p_deal_id uuid,
  p_terms jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  update public.poker_stable_deals d
  set
    pending_terms_json = p_terms,
    staker_terms_ack_required = true,
    stakee_terms_ack_required = false,
    terms_revised_at = now(),
    terms_revised_by = v_uid
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status = 'pending'
    and d.staker_user_id is not null
  returning coalesce(d.label, 'Backing stake') into v_detail;

  if not found then
    raise exception 'You cannot propose terms on this stake';
  end if;

  perform public.poker_stable_notify_lead_and_syndicate_backers(
    p_deal_id,
    v_uid,
    'poker_stable_stakee_counter_proposed',
    v_detail,
    true
  );
end;
$$;

-- Accept counter: sum + persist action from action_pct or actionPct.
create or replace function public.poker_stable_staker_accept_counter_terms(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    pending_terms_json = null,
    staker_terms_ack_required = false,
    stakee_terms_ack_required = false,
    terms_revised_at = null,
    terms_revised_by = null
  where id = p_deal_id;

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

  perform public.poker_stable_notify_stakee(
    p_deal_id,
    v_uid,
    'poker_stable_staker_counter_accepted',
    v_detail
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id);
end;
$$;

revoke all on function public.poker_stable_json_slice_action_pct(jsonb) from public;
revoke all on function public.poker_stable_assert_json_slices_action_cap(jsonb) from public;
revoke all on function public.poker_stable_deal_slices_action_cap_trg() from public;

comment on function public.poker_stable_assert_json_slices_action_cap(jsonb) is
  'Raises if JSON slices (action_pct or actionPct) sum above 100%.';

commit;
