-- Pending terms edit was delete+reinsert slices (new ids). Backers with the old Accept
-- button got a false "deleted" path, and light-poll/slice-load races could blank Stable.
-- Upsert in place so Edge slice ids survive markup/baseline edits. Also collapse
-- invite/nudge/terms Alerts into one terms_edited row per recipient.

begin;

create or replace function public.poker_stable_apply_stakee_terms(
  p_deal_id uuid,
  p_deal jsonb,
  p_slices jsonb,
  p_clear_proposal boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_label text;
  v_slice jsonb;
  v_idx integer := 0;
  v_slice_id uuid;
  v_ids uuid[] := '{}';
  v_action_total numeric := 0;
  v_staker uuid;
  v_detail text;
  v_kind text;
  v_staker_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_deal is null or jsonb_typeof(p_deal) <> 'object' then
    raise exception 'Invalid deal payload';
  end if;
  if p_slices is null or jsonb_typeof(p_slices) <> 'array' then
    raise exception 'Invalid slices payload';
  end if;

  select d.status, d.label
  into v_status, v_label
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status in ('pending', 'active', 'revoked');

  if v_status is null then
    raise exception 'You cannot edit terms on this deal';
  end if;

  if v_status = 'active' and not public.poker_stable_deal_is_guest_only(p_deal_id) then
    raise exception 'Active deals with Edge backers cannot be edited here';
  end if;

  for v_slice in select value from jsonb_array_elements(p_slices)
  loop
    v_action_total := v_action_total + coalesce((v_slice->>'action_pct')::numeric, 0);
  end loop;

  if v_action_total > 100.001 then
    raise exception 'Total action sold cannot exceed 100%%';
  end if;

  if jsonb_array_length(p_slices) = 0 and v_status = 'revoked' then
    raise exception 'Add at least one backer slice';
  end if;

  update public.poker_stable_deals
  set
    label = nullif(btrim(p_deal->>'label'), ''),
    baseline_bankroll = coalesce((p_deal->>'baseline_bankroll')::numeric, baseline_bankroll),
    starting_roll = coalesce((p_deal->>'starting_roll')::numeric, starting_roll),
    is_migration = coalesce((p_deal->>'is_migration')::boolean, is_migration),
    stake_wide_starting_pl = case
      when p_deal ? 'stake_wide_starting_pl' then (p_deal->>'stake_wide_starting_pl')::numeric
      else stake_wide_starting_pl
    end,
    lifetime_pl_display = case
      when p_deal ? 'lifetime_pl_display' then (p_deal->>'lifetime_pl_display')::numeric
      else lifetime_pl_display
    end,
    status = case when v_status = 'revoked' then 'pending' else status end,
    responded_at = case when v_status = 'revoked' then null else responded_at end,
    pending_terms_json = case when p_clear_proposal then null else pending_terms_json end,
    stakee_terms_ack_required = case when p_clear_proposal then false else stakee_terms_ack_required end,
    terms_revised_at = case when p_clear_proposal then null else terms_revised_at end,
    terms_revised_by = case when p_clear_proposal then null else terms_revised_by end
  where id = p_deal_id;

  if v_status in ('pending', 'revoked') then
    -- Suppress invite trigger for any true inserts (new backers only).
    perform set_config('poker_stable.suppress_slice_invite', '1', true);

    for v_slice in select value from jsonb_array_elements(p_slices)
    loop
      v_kind := coalesce(v_slice->>'counterparty_kind', 'guest');
      v_staker_id := nullif(v_slice->>'staker_user_id', '')::uuid;
      v_slice_id := nullif(v_slice->>'id', '')::uuid;

      if v_slice_id is not null then
        update public.poker_stable_deal_slices s
        set
          slice_index = v_idx,
          counterparty_kind = v_kind,
          staker_user_id = v_staker_id,
          guest_label = nullif(btrim(v_slice->>'guest_label'), ''),
          guest_phone = nullif(btrim(v_slice->>'guest_phone'), ''),
          guest_email = nullif(lower(btrim(v_slice->>'guest_email')), ''),
          action_pct = (v_slice->>'action_pct')::numeric,
          pricing_mode = v_slice->>'pricing_mode',
          player_profit_pct = case when v_slice->>'pricing_mode' = 'profit_split' then (v_slice->>'player_profit_pct')::numeric else null end,
          markup_rate = case when v_slice->>'pricing_mode' = 'markup' then (v_slice->>'markup_rate')::numeric else null end,
          rakeback_mode = coalesce(v_slice->>'rakeback_mode', 'disabled'),
          rakeback_player_pct = case when coalesce(v_slice->>'rakeback_mode', 'disabled') = 'custom' then (v_slice->>'rakeback_player_pct')::numeric else null end,
          status = case when v_kind = 'guest' then 'active' else 'pending' end,
          responded_at = case when v_kind = 'guest' then coalesce(s.responded_at, now()) else null end,
          label = nullif(btrim(v_slice->>'label'), '')
        where s.id = v_slice_id
          and s.deal_id = p_deal_id;

        if found then
          v_ids := array_append(v_ids, v_slice_id);
          v_idx := v_idx + 1;
          continue;
        end if;
      end if;

      -- Same Edge backer on this deal … keep their slice id across terms edits.
      if v_kind = 'user' and v_staker_id is not null then
        select s.id
        into v_slice_id
        from public.poker_stable_deal_slices s
        where s.deal_id = p_deal_id
          and s.counterparty_kind = 'user'
          and s.staker_user_id = v_staker_id
          and s.status in ('pending', 'proposed')
          and (cardinality(v_ids) = 0 or s.id <> all (v_ids))
        order by s.slice_index asc, s.created_at asc
        limit 1;

        if v_slice_id is not null then
          update public.poker_stable_deal_slices s
          set
            slice_index = v_idx,
            guest_label = null,
            guest_phone = null,
            guest_email = null,
            action_pct = (v_slice->>'action_pct')::numeric,
            pricing_mode = v_slice->>'pricing_mode',
            player_profit_pct = case when v_slice->>'pricing_mode' = 'profit_split' then (v_slice->>'player_profit_pct')::numeric else null end,
            markup_rate = case when v_slice->>'pricing_mode' = 'markup' then (v_slice->>'markup_rate')::numeric else null end,
            rakeback_mode = coalesce(v_slice->>'rakeback_mode', 'disabled'),
            rakeback_player_pct = case when coalesce(v_slice->>'rakeback_mode', 'disabled') = 'custom' then (v_slice->>'rakeback_player_pct')::numeric else null end,
            status = 'pending',
            responded_at = null,
            label = nullif(btrim(v_slice->>'label'), '')
          where s.id = v_slice_id;

          v_ids := array_append(v_ids, v_slice_id);
          v_idx := v_idx + 1;
          continue;
        end if;
      end if;

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
        v_staker_id,
        nullif(btrim(v_slice->>'guest_label'), ''),
        nullif(btrim(v_slice->>'guest_phone'), ''),
        nullif(lower(btrim(v_slice->>'guest_email')), ''),
        (v_slice->>'action_pct')::numeric,
        v_slice->>'pricing_mode',
        case when v_slice->>'pricing_mode' = 'profit_split' then (v_slice->>'player_profit_pct')::numeric else null end,
        case when v_slice->>'pricing_mode' = 'markup' then (v_slice->>'markup_rate')::numeric else null end,
        coalesce(v_slice->>'rakeback_mode', 'disabled'),
        case when coalesce(v_slice->>'rakeback_mode', 'disabled') = 'custom' then (v_slice->>'rakeback_player_pct')::numeric else null end,
        case when v_kind = 'guest' then 'active' else 'pending' end,
        case when v_kind = 'guest' then now() else null end,
        nullif(btrim(v_slice->>'label'), '')
      )
      returning id into v_slice_id;

      v_ids := array_append(v_ids, v_slice_id);
      v_idx := v_idx + 1;
    end loop;

    delete from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and (cardinality(v_ids) = 0 or s.id <> all (v_ids));

    v_detail := coalesce(nullif(trim(v_label), ''), nullif(btrim(p_deal->>'label'), ''), 'Backing stake');
    for v_staker in
      select distinct s.staker_user_id
      from public.poker_stable_deal_slices s
      where s.deal_id = p_deal_id
        and s.counterparty_kind = 'user'
        and s.staker_user_id is not null
        and s.status = 'pending'
    loop
      -- Drop prior invite/nudge/terms rows for this deal, then INSERT terms_edited
      -- (INSERT-only push trigger … one toast, one Alert).
      delete from public.activity_events ae
      where ae.recipient_user_id = v_staker
        and ae.poker_stable_deal_id = p_deal_id
        and ae.event_type in (
          'poker_stable_slice_invite',
          'poker_stable_slice_nudge',
          'poker_stable_terms_edited'
        );

      perform public.poker_stable_emit_activity_event(
        v_staker,
        v_uid,
        'poker_stable_terms_edited',
        p_deal_id,
        null,
        v_detail
      );
    end loop;

    return;
  end if;

  -- Active guest-only: update in place, preserve starting_pl + slice ids.
  for v_slice in select value from jsonb_array_elements(p_slices)
  loop
    if coalesce(v_slice->>'counterparty_kind', 'guest') <> 'guest' then
      raise exception 'Use reassign to link a guest backer to an Edge user';
    end if;

    v_slice_id := nullif(v_slice->>'id', '')::uuid;

    if v_slice_id is not null then
      update public.poker_stable_deal_slices s
      set
        slice_index = v_idx,
        guest_label = nullif(btrim(v_slice->>'guest_label'), ''),
        guest_phone = nullif(btrim(v_slice->>'guest_phone'), ''),
        guest_email = nullif(lower(btrim(v_slice->>'guest_email')), ''),
        action_pct = (v_slice->>'action_pct')::numeric,
        pricing_mode = v_slice->>'pricing_mode',
        player_profit_pct = case when v_slice->>'pricing_mode' = 'profit_split' then (v_slice->>'player_profit_pct')::numeric else null end,
        markup_rate = case when v_slice->>'pricing_mode' = 'markup' then (v_slice->>'markup_rate')::numeric else null end,
        rakeback_mode = coalesce(v_slice->>'rakeback_mode', 'disabled'),
        rakeback_player_pct = case when coalesce(v_slice->>'rakeback_mode', 'disabled') = 'custom' then (v_slice->>'rakeback_player_pct')::numeric else null end,
        label = nullif(btrim(v_slice->>'label'), '')
      where s.id = v_slice_id
        and s.deal_id = p_deal_id
        and s.counterparty_kind = 'guest';

      if not found then
        raise exception 'Guest slice not found';
      end if;

      v_ids := array_append(v_ids, v_slice_id);
    else
      insert into public.poker_stable_deal_slices (
        deal_id,
        slice_index,
        counterparty_kind,
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
        'guest',
        nullif(btrim(v_slice->>'guest_label'), ''),
        nullif(btrim(v_slice->>'guest_phone'), ''),
        nullif(lower(btrim(v_slice->>'guest_email')), ''),
        (v_slice->>'action_pct')::numeric,
        v_slice->>'pricing_mode',
        case when v_slice->>'pricing_mode' = 'profit_split' then (v_slice->>'player_profit_pct')::numeric else null end,
        case when v_slice->>'pricing_mode' = 'markup' then (v_slice->>'markup_rate')::numeric else null end,
        coalesce(v_slice->>'rakeback_mode', 'disabled'),
        case when coalesce(v_slice->>'rakeback_mode', 'disabled') = 'custom' then (v_slice->>'rakeback_player_pct')::numeric else null end,
        'active',
        now(),
        nullif(btrim(v_slice->>'label'), '')
      )
      returning id into v_slice_id;

      v_ids := array_append(v_ids, v_slice_id);
    end if;

    v_idx := v_idx + 1;
  end loop;

  if jsonb_array_length(p_slices) > 0 then
    delete from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.counterparty_kind = 'guest'
      and (cardinality(v_ids) = 0 or s.id <> all (v_ids));
  end if;
end;
$$;

comment on function public.poker_stable_apply_stakee_terms(uuid, jsonb, jsonb, boolean) is
  'Stakee applies deal/slice terms; pending Edge slices keep ids; collapses invite Alerts into terms_edited.';

-- One-time: collapse stacked invite/nudge/terms Alerts for the same recipient+deal.
with ranked as (
  select
    ae.id,
    row_number() over (
      partition by ae.recipient_user_id, ae.poker_stable_deal_id
      order by
        case ae.event_type
          when 'poker_stable_terms_edited' then 0
          when 'poker_stable_slice_nudge' then 1
          else 2
        end,
        ae.created_at desc nulls last,
        ae.id desc
    ) as rn
  from public.activity_events ae
  where ae.poker_stable_deal_id is not null
    and ae.event_type in (
      'poker_stable_slice_invite',
      'poker_stable_slice_nudge',
      'poker_stable_terms_edited'
    )
),
kept as (
  update public.activity_events ae
  set
    event_type = 'poker_stable_terms_edited',
    read_at = null
  from ranked r
  where ae.id = r.id
    and r.rn = 1
    and ae.event_type is distinct from 'poker_stable_terms_edited'
  returning ae.id
)
delete from public.activity_events ae
using ranked r
where ae.id = r.id
  and r.rn > 1;

commit;
