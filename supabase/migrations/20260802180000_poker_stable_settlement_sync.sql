-- Settlement sync: bilateral confirm/deny on periodic settle + close.
-- Per-user ledger entries on accept. Drop payment-claim activity paths.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.poker_stable_settlement_requests (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.poker_stable_deals(id) on delete cascade,
  proposed_by_user_id uuid not null references auth.users(id),
  settle_kind text not null check (settle_kind in ('periodic', 'close')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  rakeback_total numeric not null default 0,
  note text,
  preview_json jsonb not null default '{}'::jsonb,
  settlement_id uuid references public.poker_stable_deal_settlements(id) on delete set null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists poker_stable_settlement_requests_deal_idx
  on public.poker_stable_settlement_requests (deal_id, created_at desc);

create index if not exists poker_stable_settlement_requests_pending_deal_idx
  on public.poker_stable_settlement_requests (deal_id)
  where status = 'pending';

create table if not exists public.poker_stable_settlement_request_votes (
  request_id uuid not null
    references public.poker_stable_settlement_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'denied')),
  responded_at timestamptz,
  primary key (request_id, user_id)
);

create table if not exists public.poker_stable_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.poker_stable_deals(id) on delete cascade,
  settlement_id uuid references public.poker_stable_deal_settlements(id) on delete set null,
  request_id uuid references public.poker_stable_settlement_requests(id) on delete set null,
  user_id uuid not null references auth.users(id),
  entry_kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists poker_stable_ledger_entries_deal_idx
  on public.poker_stable_ledger_entries (deal_id, created_at desc);

create index if not exists poker_stable_ledger_entries_user_idx
  on public.poker_stable_ledger_entries (user_id, created_at desc);

alter table public.poker_stable_settlement_requests enable row level security;
alter table public.poker_stable_settlement_request_votes enable row level security;
alter table public.poker_stable_ledger_entries enable row level security;

drop policy if exists "poker_stable_settlement_requests_select" on public.poker_stable_settlement_requests;
create policy "poker_stable_settlement_requests_select"
  on public.poker_stable_settlement_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.poker_stable_deals d
      where d.id = deal_id
        and (
          d.stakee_user_id = auth.uid()
          or exists (
            select 1 from public.poker_stable_deal_slices s
            where s.deal_id = d.id
              and s.staker_user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "poker_stable_settlement_request_votes_select" on public.poker_stable_settlement_request_votes;
create policy "poker_stable_settlement_request_votes_select"
  on public.poker_stable_settlement_request_votes for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.poker_stable_settlement_requests r
      join public.poker_stable_deals d on d.id = r.deal_id
      where r.id = request_id
        and (
          d.stakee_user_id = auth.uid()
          or r.proposed_by_user_id = auth.uid()
        )
    )
  );

drop policy if exists "poker_stable_ledger_entries_select" on public.poker_stable_ledger_entries;
create policy "poker_stable_ledger_entries_select"
  on public.poker_stable_ledger_entries for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.poker_stable_settlement_requests to authenticated;
grant select on public.poker_stable_settlement_request_votes to authenticated;
grant select on public.poker_stable_ledger_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Activity events: settlement request deep link (retire payment claim events)
-- ---------------------------------------------------------------------------

alter table public.activity_events
  add column if not exists poker_stable_settlement_request_id uuid
    references public.poker_stable_settlement_requests(id) on delete set null;

create index if not exists activity_events_poker_stable_settle_req_idx
  on public.activity_events (poker_stable_settlement_request_id)
  where poker_stable_settlement_request_id is not null;

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid',
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite',
      'chat_call_missed',
      'chat_mention',
      'starter_weekly_guide_drop',
      'creator_fan_sub',
      'poker_tournament_swap',
      'poker_tournament_swap_result',
      'ap_guide_released',
      'poker_stable_slice_invite',
      'poker_stable_session_complete',
      'poker_stable_settled',
      'poker_stable_payment_claim',
      'poker_stable_payment_claim_resolved',
      'poker_stable_settlement_proposed',
      'poker_stable_settlement_resolved'
    )
  );

drop function if exists public.poker_stable_emit_activity_event(uuid, uuid, text, uuid, uuid, text);

create or replace function public.poker_stable_emit_activity_event(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_deal_id uuid default null,
  p_request_id uuid default null,
  p_detail_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null or p_actor_user_id is null then
    return null;
  end if;
  if p_recipient_user_id = p_actor_user_id then
    return null;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    poker_stable_deal_id,
    poker_stable_settlement_request_id,
    detail_text
  )
  values (
    p_recipient_user_id,
    p_actor_user_id,
    p_event_type,
    p_deal_id,
    p_request_id,
    nullif(trim(coalesce(p_detail_text, '')), '')
  )
  returning id into v_id;

  return v_id;
exception
  when others then
    raise warning 'poker_stable_emit_activity_event: %', sqlerrm;
    return null;
end;
$$;

drop trigger if exists poker_stable_settled_activity on public.poker_stable_deal_settlements;
drop trigger if exists poker_stable_payment_claim_activity on public.poker_stable_payment_claims;

-- ---------------------------------------------------------------------------
-- Preview + apply settlement (internal)
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_preview_settlement(
  p_deal_id uuid,
  p_rakeback_total numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_profit_above numeric;
  v_makeup numeric;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_shares record;
  v_player_net numeric := 0;
  v_line_signed numeric;
  v_lines jsonb := '[]'::jsonb;
  v_player_credit numeric := 0;
begin
  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);
  v_profit_above := public.poker_stable_round_money(greatest(0, v_roll - v_baseline));
  v_makeup := public.poker_stable_round_money(greatest(0, v_baseline - v_roll));

  for v_slice in
    select *
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
    order by s.slice_index
  loop
    select * into v_shares
    from public.poker_stable_slice_settle_shares(v_slice, v_profit_above, coalesce(p_rakeback_total, 0));

    v_lines := v_lines || jsonb_build_object(
      'slice_id', v_slice.id,
      'staker_user_id', v_slice.staker_user_id,
      'counterparty_kind', v_slice.counterparty_kind,
      'guest_label', v_slice.guest_label,
      'profit_share', v_shares.profit_share,
      'rakeback_share', v_shares.rakeback_share,
      'total_owed', v_shares.total_owed,
      'direction', v_shares.direction
    );

    v_line_signed := case
      when v_shares.direction = 'player_to_staker' then v_shares.total_owed
      else -v_shares.total_owed
    end;
    v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);
  end loop;

  v_player_net := public.poker_stable_round_money(v_profit_above + v_player_net);
  v_player_credit := case when v_profit_above > 0 then v_player_net else 0 end;

  return jsonb_build_object(
    'baseline_at_settle', v_baseline,
    'roll_at_settle', v_roll,
    'profit_above_baseline', v_profit_above,
    'makeup_at_settle', v_makeup,
    'rakeback_total', public.poker_stable_round_money(coalesce(p_rakeback_total, 0)),
    'player_net', v_player_net,
    'player_credit', v_player_credit,
    'lines', v_lines
  );
end;
$$;

create or replace function public.poker_stable_fmt_money(p_amount numeric)
returns text
language sql
immutable
as $$
  select trim(to_char(coalesce(p_amount, 0), 'FM$999,999,990.00'));
$$;

create or replace function public.poker_stable_profile_display_name(p_user_id uuid)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(p.display_name), ''),
    case when nullif(trim(p.handle), '') is not null then '@' || trim(p.handle) else 'User' end
  )
  from public.profiles p
  where p.user_id = p_user_id;
$$;

create or replace function public.poker_stable_write_settlement_ledger_entries(
  p_settlement_id uuid,
  p_request_id uuid,
  p_deal_id uuid,
  p_finalize boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_st public.poker_stable_deal_settlements%rowtype;
  v_stakee uuid;
  v_player_name text;
  v_kind text;
  v_prefix text;
  v_player_payments text := '';
  v_line record;
  v_backer_name text;
  v_backer_credit numeric;
  v_player_credit numeric;
  v_baseline numeric;
  v_player_msg text;
  v_backer_msg text;
begin
  select * into v_st from public.poker_stable_deal_settlements where id = p_settlement_id;
  select * into v_deal from public.poker_stable_deals where id = p_deal_id;
  if v_st.id is null or v_deal.id is null then
    return;
  end if;

  v_stakee := v_deal.stakee_user_id;
  v_player_name := public.poker_stable_profile_display_name(v_stakee);
  v_kind := case when p_finalize then 'close_settlement' else 'periodic_settlement' end;
  v_prefix := case when p_finalize then 'Close settlement' else 'Periodic settlement' end;
  v_baseline := coalesce(v_st.baseline_at_settle, 0);
  v_player_credit := 0;

  if coalesce(v_st.profit_above_baseline, 0) > 0 then
    select public.poker_stable_round_money(
      coalesce(v_st.profit_above_baseline, 0) - coalesce(sum(
        case
          when l.direction = 'player_to_staker' then l.total_owed
          else -l.total_owed
        end
      ), 0)
    )
    into v_player_credit
    from public.poker_stable_deal_settlement_lines l
    where l.settlement_id = p_settlement_id;
  end if;

  for v_line in
    select l.*, s.staker_user_id, s.counterparty_kind, s.guest_label
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where l.settlement_id = p_settlement_id
    order by s.slice_index
  loop
    if v_line.direction = 'player_to_staker' and v_line.total_owed > 0 then
      v_backer_name := case
        when v_line.counterparty_kind = 'guest' then coalesce(v_line.guest_label, 'Guest')
        else public.poker_stable_profile_display_name(v_line.staker_user_id)
      end;
      if v_player_payments <> '' then
        v_player_payments := v_player_payments || '; ';
      end if;
      v_player_payments := v_player_payments || format('you paid %s %s', v_backer_name, public.poker_stable_fmt_money(v_line.total_owed));
    end if;

    if v_line.counterparty_kind = 'user' and v_line.staker_user_id is not null then
      v_backer_name := public.poker_stable_profile_display_name(v_line.staker_user_id);
      v_backer_credit := public.poker_stable_round_money(v_line.profit_share + v_line.rakeback_share);

      if v_line.direction = 'player_to_staker' and v_line.total_owed > 0 then
        v_backer_msg := format(
          '%s: %s paid you %s. Your personal balance was credited: %s. Stake bankroll rebalanced to %s.',
          v_prefix,
          v_player_name,
          public.poker_stable_fmt_money(v_line.total_owed),
          public.poker_stable_fmt_money(v_backer_credit),
          public.poker_stable_fmt_money(v_baseline)
        );
      elsif v_line.direction = 'staker_to_player' and v_line.total_owed > 0 then
        v_backer_msg := format(
          '%s: you paid %s %s. Your personal balance was adjusted: %s. Stake bankroll rebalanced to %s.',
          v_prefix,
          v_player_name,
          public.poker_stable_fmt_money(v_line.total_owed),
          public.poker_stable_fmt_money(-v_backer_credit),
          public.poker_stable_fmt_money(v_baseline)
        );
      else
        v_backer_msg := format(
          '%s: stake bankroll rebalanced to %s.',
          v_prefix,
          public.poker_stable_fmt_money(v_baseline)
        );
      end if;

      insert into public.poker_stable_ledger_entries (
        deal_id, settlement_id, request_id, user_id, entry_kind, message
      )
      values (
        p_deal_id, p_settlement_id, p_request_id, v_line.staker_user_id, v_kind, v_backer_msg
      );
    end if;
  end loop;

  if v_player_payments = '' then
    v_player_payments := 'no slice payments due';
  end if;

  v_player_msg := format(
    '%s: %s. Your personal bankroll was credited: %s. Stake bankroll rebalanced to %s.',
    v_prefix,
    v_player_payments,
    public.poker_stable_fmt_money(v_player_credit),
    public.poker_stable_fmt_money(v_baseline)
  );

  insert into public.poker_stable_ledger_entries (
    deal_id, settlement_id, request_id, user_id, entry_kind, message
  )
  values (
    p_deal_id, p_settlement_id, p_request_id, v_stakee, v_kind, v_player_msg
  );
end;
$$;

create or replace function public.poker_stable_apply_settlement(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_finalize boolean default false,
  p_settled_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_settled_by_user_id, auth.uid());
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_profit_above numeric;
  v_makeup numeric;
  v_settlement_id uuid;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_shares record;
  v_player_net numeric := 0;
  v_player_credit numeric := 0;
  v_line_signed numeric;
  v_staker_credit numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  if v_deal.status not in ('active', 'revoked') then
    raise exception 'Deal is not open for settlement';
  end if;

  if v_deal.deal_type not in ('cash_backing', 'tournament_package') then
    raise exception 'Settle is only for ongoing backing deals';
  end if;

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);
  v_profit_above := public.poker_stable_round_money(greatest(0, v_roll - v_baseline));
  v_makeup := public.poker_stable_round_money(greatest(0, v_baseline - v_roll));

  insert into public.poker_stable_deal_settlements (
    deal_id,
    baseline_at_settle,
    roll_at_settle,
    profit_above_baseline,
    makeup_at_settle,
    rakeback_total,
    settled_by_user_id,
    note
  )
  values (
    p_deal_id,
    v_baseline,
    v_roll,
    v_profit_above,
    v_makeup,
    public.poker_stable_round_money(coalesce(p_rakeback_total, 0)),
    v_uid,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_settlement_id;

  for v_slice in
    select *
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
    order by s.slice_index
  loop
    select * into v_shares
    from public.poker_stable_slice_settle_shares(v_slice, v_profit_above, coalesce(p_rakeback_total, 0));

    insert into public.poker_stable_deal_settlement_lines (
      settlement_id, slice_id, profit_share, rakeback_share, total_owed, direction
    )
    values (
      v_settlement_id,
      v_slice.id,
      v_shares.profit_share,
      v_shares.rakeback_share,
      v_shares.total_owed,
      v_shares.direction
    );

    v_line_signed := case
      when v_shares.direction = 'player_to_staker' then v_shares.total_owed
      else -v_shares.total_owed
    end;
    v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);

    if v_slice.counterparty_kind = 'user' and v_slice.staker_user_id is not null then
      v_staker_credit := public.poker_stable_round_money(v_shares.profit_share + v_shares.rakeback_share);
      if v_shares.direction = 'staker_to_player' then
        v_staker_credit := -v_staker_credit;
      end if;
      if v_staker_credit <> 0 then
        insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
        values (v_slice.staker_user_id, v_staker_credit)
        on conflict (user_id) do update
          set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
      end if;
    end if;
  end loop;

  v_player_net := public.poker_stable_round_money(v_profit_above + v_player_net);
  v_player_credit := case when v_profit_above > 0 then v_player_net else 0 end;

  if v_player_credit <> 0 then
    insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
    values (v_deal.stakee_user_id, v_player_credit)
    on conflict (user_id) do update
      set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
  end if;

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, v_baseline)
  on conflict (deal_id) do update
    set overall_bankroll = excluded.overall_bankroll;

  if p_finalize then
    update public.poker_stable_deals
    set status = 'settled',
        settled_at = now(),
        updated_at = now()
    where id = p_deal_id;
  else
    update public.poker_stable_deals
    set updated_at = now()
    where id = p_deal_id;
  end if;

  return v_settlement_id;
end;
$$;

create or replace function public.poker_stable_deal_needs_settlement_sync(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
  );
$$;

create or replace function public.poker_stable_propose_settlement(
  p_deal_id uuid,
  p_finalize boolean default false,
  p_rakeback_total numeric default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals%rowtype;
  v_is_stakee boolean;
  v_is_staker boolean;
  v_request_id uuid;
  v_settlement_id uuid;
  v_preview jsonb;
  v_voter uuid;
  v_kind text;
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  v_is_stakee := v_deal.stakee_user_id = v_uid;
  v_is_staker := exists (
    select 1 from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
      and s.staker_user_id = v_uid
      and s.counterparty_kind = 'user'
  );

  if not v_is_stakee and not v_is_staker then
    raise exception 'Not authorized to propose settlement on this stake';
  end if;

  if v_deal.status not in ('active', 'revoked') then
    raise exception 'Deal is not open for settlement';
  end if;

  if exists (
    select 1 from public.poker_stable_settlement_requests r
    where r.deal_id = p_deal_id and r.status = 'pending'
  ) then
    raise exception 'A settlement is already awaiting confirmation';
  end if;

  if not p_finalize and v_deal.deal_type <> 'cash_backing' then
    raise exception 'Periodic settle applies to cash backing only';
  end if;

  v_preview := public.poker_stable_preview_settlement(p_deal_id, p_rakeback_total);
  v_kind := case when p_finalize then 'close' else 'periodic' end;

  if not public.poker_stable_deal_needs_settlement_sync(p_deal_id) then
    v_settlement_id := public.poker_stable_apply_settlement(
      p_deal_id,
      p_rakeback_total,
      p_note,
      p_finalize,
      v_uid
    );
    perform public.poker_stable_write_settlement_ledger_entries(
      v_settlement_id,
      null,
      p_deal_id,
      p_finalize
    );
    return jsonb_build_object(
      'immediate', true,
      'settlement_id', v_settlement_id,
      'request_id', null
    );
  end if;

  insert into public.poker_stable_settlement_requests (
    deal_id,
    proposed_by_user_id,
    settle_kind,
    rakeback_total,
    note,
    preview_json
  )
  values (
    p_deal_id,
    v_uid,
    v_kind,
    public.poker_stable_round_money(coalesce(p_rakeback_total, 0)),
    nullif(trim(coalesce(p_note, '')), ''),
    v_preview
  )
  returning id into v_request_id;

  if v_is_stakee then
    for v_voter in
      select distinct s.staker_user_id
      from public.poker_stable_deal_slices s
      where s.deal_id = p_deal_id
        and s.status = 'active'
        and s.counterparty_kind = 'user'
        and s.staker_user_id is not null
    loop
      insert into public.poker_stable_settlement_request_votes (request_id, user_id)
      values (v_request_id, v_voter);

      v_detail := format(
        '%s · %s settlement proposed',
        coalesce(v_deal.label, 'Stake'),
        case when p_finalize then 'Close' else 'Periodic' end
      );

      perform public.poker_stable_emit_activity_event(
        v_voter,
        v_uid,
        'poker_stable_settlement_proposed',
        p_deal_id,
        v_request_id,
        v_detail
      );
    end loop;
  else
    insert into public.poker_stable_settlement_request_votes (request_id, user_id)
    values (v_request_id, v_deal.stakee_user_id);

    v_detail := format(
      '%s · %s settlement proposed',
      coalesce(v_deal.label, 'Stake'),
      case when p_finalize then 'Close' else 'Periodic' end
    );

    perform public.poker_stable_emit_activity_event(
      v_deal.stakee_user_id,
      v_uid,
      'poker_stable_settlement_proposed',
      p_deal_id,
      v_request_id,
      v_detail
    );
  end if;

  return jsonb_build_object(
    'immediate', false,
    'settlement_id', null,
    'request_id', v_request_id
  );
end;
$$;

create or replace function public.poker_stable_respond_settlement(
  p_request_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.poker_stable_settlement_requests%rowtype;
  v_vote public.poker_stable_settlement_request_votes%rowtype;
  v_pending int;
  v_denied int;
  v_settlement_id uuid;
  v_finalize boolean;
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_response not in ('confirmed', 'denied') then
    raise exception 'Invalid response';
  end if;

  select * into v_req
  from public.poker_stable_settlement_requests r
  where r.id = p_request_id
  for update;

  if v_req.id is null then
    raise exception 'Settlement request not found';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Settlement request is no longer pending';
  end if;

  select * into v_vote
  from public.poker_stable_settlement_request_votes v
  where v.request_id = p_request_id
    and v.user_id = v_uid
  for update;

  if v_vote.user_id is null then
    raise exception 'You are not required to respond to this settlement';
  end if;

  if v_vote.status <> 'pending' then
    raise exception 'You already responded to this settlement';
  end if;

  update public.poker_stable_settlement_request_votes
  set status = case when p_response = 'confirmed' then 'confirmed' else 'denied' end,
      responded_at = now()
  where request_id = p_request_id
    and user_id = v_uid;

  if p_response = 'denied' then
    update public.poker_stable_settlement_requests
    set status = 'rejected',
        finalized_at = now()
    where id = p_request_id;

    v_detail := 'Settlement was denied';
    perform public.poker_stable_emit_activity_event(
      v_req.proposed_by_user_id,
      v_uid,
      'poker_stable_settlement_resolved',
      v_req.deal_id,
      p_request_id,
      v_detail
    );

    return jsonb_build_object('status', 'rejected', 'settlement_id', null);
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'denied')
  into v_pending, v_denied
  from public.poker_stable_settlement_request_votes
  where request_id = p_request_id;

  if v_denied > 0 then
    update public.poker_stable_settlement_requests
    set status = 'rejected',
        finalized_at = now()
    where id = p_request_id;

    return jsonb_build_object('status', 'rejected', 'settlement_id', null);
  end if;

  if v_pending > 0 then
    return jsonb_build_object('status', 'pending', 'settlement_id', null);
  end if;

  v_finalize := v_req.settle_kind = 'close';

  v_settlement_id := public.poker_stable_apply_settlement(
    v_req.deal_id,
    v_req.rakeback_total,
    v_req.note,
    v_finalize,
    v_req.proposed_by_user_id
  );

  perform public.poker_stable_write_settlement_ledger_entries(
    v_settlement_id,
    p_request_id,
    v_req.deal_id,
    v_finalize
  );

  update public.poker_stable_settlement_requests
  set status = 'accepted',
      settlement_id = v_settlement_id,
      finalized_at = now()
  where id = p_request_id;

  v_detail := 'Settlement confirmed and applied';
  perform public.poker_stable_emit_activity_event(
    v_req.proposed_by_user_id,
    v_uid,
    'poker_stable_settlement_resolved',
    v_req.deal_id,
    p_request_id,
    v_detail
  );

  return jsonb_build_object('status', 'accepted', 'settlement_id', v_settlement_id);
end;
$$;

-- Replace direct settle RPCs with propose wrapper (backward-compatible names)
create or replace function public.poker_stable_periodic_settle(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.poker_stable_propose_settlement(p_deal_id, false, p_rakeback_total, p_note);
  if coalesce((v_result->>'immediate')::boolean, false) then
    return (v_result->>'settlement_id')::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.poker_stable_close_deal(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.poker_stable_propose_settlement(p_deal_id, true, p_rakeback_total, p_note);
  if coalesce((v_result->>'immediate')::boolean, false) then
    return (v_result->>'settlement_id')::uuid;
  end if;
  return null;
end;
$$;

revoke all on function public.poker_stable_preview_settlement(uuid, numeric) from public;
revoke all on function public.poker_stable_propose_settlement(uuid, boolean, numeric, text) from public;
revoke all on function public.poker_stable_respond_settlement(uuid, text) from public;

grant execute on function public.poker_stable_preview_settlement(uuid, numeric) to authenticated;
grant execute on function public.poker_stable_propose_settlement(uuid, boolean, numeric, text) to authenticated;
grant execute on function public.poker_stable_respond_settlement(uuid, text) to authenticated;

-- lounge_activity_events_page: settlement request id
drop function if exists public.lounge_activity_events_page(integer, timestamptz, uuid);

create function public.lounge_activity_events_page(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  post_id uuid,
  comment_id uuid,
  play_log_entry_id uuid,
  chat_room_id uuid,
  chat_call_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean,
  play_log_game_name text,
  play_log_share_percent numeric,
  starter_weekly_unlock_id uuid,
  detail_text text,
  poker_tournament_swap_id uuid,
  guide_slug text,
  poker_stable_deal_id uuid,
  poker_stable_settlement_request_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ae.id,
    ae.event_type,
    ae.post_id,
    ae.comment_id,
    ae.play_log_entry_id,
    ae.chat_room_id,
    ae.chat_call_id,
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle as actor_handle,
    p.display_name as actor_display_name,
    p.avatar_url as actor_avatar_url,
    p.role as actor_role,
    coalesce(p.is_og, false) as actor_is_og,
    tpl.display_name as play_log_game_name,
    sp.share_percent as play_log_share_percent,
    ae.starter_weekly_unlock_id,
    ae.detail_text,
    ae.poker_tournament_swap_id,
    ae.guide_slug,
    ae.poker_stable_deal_id,
    ae.poker_stable_settlement_request_id
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  left join public.play_log_entries ple on ple.id = ae.play_log_entry_id
  left join public.play_log_game_templates tpl on tpl.id = ple.template_id
  left join public.play_log_session_partners sp
    on sp.session_id = ple.session_id
   and sp.user_id = auth.uid()
   and sp.participant_kind = 'user'
  where ae.recipient_user_id = auth.uid()
    and ae.event_type not in (
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite'
    )
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;

commit;
