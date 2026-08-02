-- Unilateral commit + optional sync (replaces bilateral settlement vote queue).
-- Deal-level facts apply when anyone records; personal bankroll/history per party on record or sync.

begin;

-- ---------------------------------------------------------------------------
-- Commit log + per-party sync acks
-- ---------------------------------------------------------------------------

create table if not exists public.poker_stable_deal_commits (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.poker_stable_deals(id) on delete cascade,
  recorded_by_user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null check (event_kind in ('topup', 'reduction', 'periodic_settle', 'close_settle')),
  ref_id uuid not null,
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists poker_stable_deal_commits_deal_idx
  on public.poker_stable_deal_commits (deal_id, created_at desc);

create table if not exists public.poker_stable_commit_syncs (
  commit_id uuid not null references public.poker_stable_deal_commits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  synced_at timestamptz not null default now(),
  primary key (commit_id, user_id)
);

alter table public.poker_stable_deal_commits enable row level security;
alter table public.poker_stable_commit_syncs enable row level security;

drop policy if exists "poker_stable_deal_commits_select" on public.poker_stable_deal_commits;
create policy "poker_stable_deal_commits_select"
  on public.poker_stable_deal_commits for select
  to authenticated
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_commit_syncs_select" on public.poker_stable_commit_syncs;
create policy "poker_stable_commit_syncs_select"
  on public.poker_stable_commit_syncs for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.poker_stable_deal_commits c
      where c.id = commit_id
        and public.poker_stable_user_can_access_deal(c.deal_id, auth.uid())
    )
  );

grant select on public.poker_stable_deal_commits to authenticated;
grant select on public.poker_stable_commit_syncs to authenticated;

alter table public.poker_stable_ledger_entries
  add column if not exists commit_id uuid references public.poker_stable_deal_commits(id) on delete set null;

alter table public.activity_events
  add column if not exists poker_stable_commit_id uuid references public.poker_stable_deal_commits(id) on delete set null;

create index if not exists activity_events_poker_stable_commit_idx
  on public.activity_events (poker_stable_commit_id)
  where poker_stable_commit_id is not null;

alter table public.activity_events drop constraint if exists activity_events_event_type_check;

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
      'poker_stable_settlement_resolved',
      'poker_stable_commit_recorded'
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_user_is_active_staker(p_deal_id uuid, p_uid uuid)
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
      and s.staker_user_id = p_uid
  );
$$;

create or replace function public.poker_stable_user_can_record_deal_event(p_deal_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.poker_stable_deals d
    where d.id = p_deal_id
      and d.status = 'active'
      and (
        d.stakee_user_id = p_uid
        or public.poker_stable_user_is_active_staker(p_deal_id, p_uid)
      )
  );
$$;

create or replace function public.poker_stable_staker_share_amount(
  p_deal_id uuid,
  p_total numeric,
  p_user_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_pct numeric;
begin
  if coalesce(p_total, 0) <= 0 or p_user_id is null then
    return 0;
  end if;

  v_total := public.poker_stable_active_slice_action_total(p_deal_id);
  if v_total <= 0 then
    return 0;
  end if;

  select coalesce(s.action_pct, 0) into v_pct
  from public.poker_stable_deal_slices s
  where s.deal_id = p_deal_id
    and s.status = 'active'
    and s.counterparty_kind = 'user'
    and s.staker_user_id = p_user_id
  order by s.slice_index
  limit 1;

  if coalesce(v_pct, 0) <= 0 then
    return 0;
  end if;

  return public.poker_stable_round_money(p_total * (v_pct / v_total));
end;
$$;

create or replace function public.poker_stable_debit_staker_share(
  p_deal_id uuid,
  p_amount numeric,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share numeric;
begin
  v_share := public.poker_stable_staker_share_amount(p_deal_id, p_amount, p_user_id);
  if v_share <= 0 then
    return;
  end if;

  insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
  values (p_user_id, -v_share)
  on conflict (user_id) do update
    set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll - v_share;
end;
$$;

create or replace function public.poker_stable_credit_staker_share(
  p_deal_id uuid,
  p_amount numeric,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share numeric;
begin
  v_share := public.poker_stable_staker_share_amount(p_deal_id, p_amount, p_user_id);
  if v_share <= 0 then
    return;
  end if;

  insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
  values (p_user_id, v_share)
  on conflict (user_id) do update
    set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + v_share;
end;
$$;

create or replace function public.poker_stable_insert_commit_sync(
  p_commit_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.poker_stable_commit_syncs (commit_id, user_id)
  values (p_commit_id, p_user_id)
  on conflict (commit_id, user_id) do nothing;
end;
$$;

drop function if exists public.poker_stable_emit_activity_event(uuid, uuid, text, uuid, uuid, text);

create or replace function public.poker_stable_emit_activity_event(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_deal_id uuid default null,
  p_request_id uuid default null,
  p_detail_text text default null,
  p_commit_id uuid default null
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
    poker_stable_commit_id,
    detail_text
  )
  values (
    p_recipient_user_id,
    p_actor_user_id,
    p_event_type,
    p_deal_id,
    p_request_id,
    p_commit_id,
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

create or replace function public.poker_stable_notify_commit_parties(
  p_commit_id uuid,
  p_deal_id uuid,
  p_actor_user_id uuid,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_staker uuid;
begin
  select * into v_deal from public.poker_stable_deals where id = p_deal_id;
  if v_deal.id is null then
    return;
  end if;

  if v_deal.stakee_user_id is not null and v_deal.stakee_user_id <> p_actor_user_id then
    perform public.poker_stable_emit_activity_event(
      v_deal.stakee_user_id,
      p_actor_user_id,
      'poker_stable_commit_recorded',
      p_deal_id,
      null,
      p_detail,
      p_commit_id
    );
  end if;

  for v_staker in
    select distinct s.staker_user_id
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and s.staker_user_id <> p_actor_user_id
  loop
    perform public.poker_stable_emit_activity_event(
      v_staker,
      p_actor_user_id,
      'poker_stable_commit_recorded',
      p_deal_id,
      null,
      p_detail,
      p_commit_id
    );
  end loop;
end;
$$;

create or replace function public.poker_stable_record_commit(
  p_deal_id uuid,
  p_recorded_by uuid,
  p_event_kind text,
  p_ref_id uuid,
  p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commit_id uuid;
begin
  insert into public.poker_stable_deal_commits (
    deal_id,
    recorded_by_user_id,
    event_kind,
    ref_id,
    summary
  )
  values (
    p_deal_id,
    p_recorded_by,
    p_event_kind,
    p_ref_id,
    nullif(trim(coalesce(p_summary, '')), '')
  )
  returning id into v_commit_id;

  perform public.poker_stable_insert_commit_sync(v_commit_id, p_recorded_by);
  perform public.poker_stable_notify_commit_parties(
    v_commit_id,
    p_deal_id,
    p_recorded_by,
    coalesce(p_summary, 'Stake updated — sync to update your books')
  );

  return v_commit_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settlement: deal-level only in apply_settlement (personal split out)
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_apply_settlement_personal(
  p_settlement_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_st public.poker_stable_deal_settlements%rowtype;
  v_deal public.poker_stable_deals%rowtype;
  v_line record;
  v_player_credit numeric := 0;
  v_staker_credit numeric;
  v_player_net numeric := 0;
  v_line_signed numeric;
begin
  select * into v_st from public.poker_stable_deal_settlements where id = p_settlement_id;
  if v_st.id is null then
    raise exception 'Settlement not found';
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_st.deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  if p_user_id = v_deal.stakee_user_id then
    if coalesce(v_st.profit_above_baseline, 0) > 0 then
      for v_line in
        select l.*
        from public.poker_stable_deal_settlement_lines l
        where l.settlement_id = p_settlement_id
      loop
        v_line_signed := case
          when v_line.direction = 'player_to_staker' then v_line.total_owed
          else -v_line.total_owed
        end;
        v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);
      end loop;

      v_player_net := public.poker_stable_round_money(coalesce(v_st.profit_above_baseline, 0) + v_player_net);
      v_player_credit := case when coalesce(v_st.profit_above_baseline, 0) > 0 then v_player_net else 0 end;
    end if;

    if v_player_credit <> 0 then
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (p_user_id, v_player_credit)
      on conflict (user_id) do update
        set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
    end if;

    return;
  end if;

  for v_line in
    select l.*, s.staker_user_id, s.counterparty_kind
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where l.settlement_id = p_settlement_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
  loop
    v_staker_credit := public.poker_stable_round_money(v_line.profit_share + v_line.rakeback_share);
    if v_line.direction = 'staker_to_player' then
      v_staker_credit := -v_staker_credit;
    end if;
    if v_staker_credit <> 0 then
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (p_user_id, v_staker_credit)
      on conflict (user_id) do update
        set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
    end if;
  end loop;
end;
$$;

create or replace function public.poker_stable_write_settlement_ledger_for_user(
  p_settlement_id uuid,
  p_commit_id uuid,
  p_deal_id uuid,
  p_finalize boolean,
  p_user_id uuid
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

  if p_user_id = v_stakee then
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
      deal_id, settlement_id, commit_id, user_id, entry_kind, message
    )
    values (
      p_deal_id, p_settlement_id, p_commit_id, p_user_id, v_kind, v_player_msg
    );

    return;
  end if;

  for v_line in
    select l.*, s.staker_user_id, s.counterparty_kind, s.guest_label, s.slice_index
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where l.settlement_id = p_settlement_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
    order by s.slice_index
  loop
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
      deal_id, settlement_id, commit_id, user_id, entry_kind, message
    )
    values (
      p_deal_id, p_settlement_id, p_commit_id, p_user_id, v_kind, v_backer_msg
    );
  end loop;
end;
$$;

create or replace function public.poker_stable_apply_settlement(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_finalize boolean default false,
  p_settled_by_user_id uuid default null,
  p_stake_reduction_total numeric default 0
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
  v_reduction numeric;
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

  v_reduction := public.poker_stable_round_money(greatest(0, coalesce(p_stake_reduction_total, 0)));

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);

  if v_reduction > v_baseline + 0.005 then
    raise exception 'Stake reduction cannot exceed baseline';
  end if;

  v_profit_above := public.poker_stable_round_money(greatest(0, v_roll - v_baseline));
  v_makeup := public.poker_stable_round_money(greatest(0, v_baseline - v_roll));

  insert into public.poker_stable_deal_settlements (
    deal_id,
    baseline_at_settle,
    roll_at_settle,
    profit_above_baseline,
    makeup_at_settle,
    rakeback_total,
    stake_reduction_total,
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
    v_reduction,
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
  end loop;

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

  if v_reduction > 0 then
    perform public.poker_stable_apply_stake_reduction(
      p_deal_id,
      v_reduction,
      v_uid,
      v_settlement_id,
      'With periodic settlement',
      true
    );
  end if;

  return v_settlement_id;
end;
$$;

create or replace function public.poker_stable_apply_stake_reduction(
  p_deal_id uuid,
  p_amount numeric,
  p_logged_by_user_id uuid,
  p_settlement_id uuid default null,
  p_note text default null,
  p_skip_personal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_reduction_id uuid;
begin
  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive amount.';
  end if;

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

  if v_amt > v_baseline + 0.005 then
    raise exception 'Stake reduction cannot exceed baseline';
  end if;

  insert into public.poker_stable_deal_reductions (
    deal_id,
    settlement_id,
    amount,
    funding_mode,
    baseline_before,
    baseline_after,
    roll_before,
    roll_after,
    logged_by_user_id,
    note
  )
  values (
    p_deal_id,
    p_settlement_id,
    v_amt,
    'pro_rata',
    v_baseline,
    public.poker_stable_round_money(v_baseline - v_amt),
    v_roll,
    public.poker_stable_round_money(v_roll - v_amt),
    p_logged_by_user_id,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_reduction_id;

  update public.poker_stable_deals
  set baseline_bankroll = public.poker_stable_round_money(v_baseline - v_amt),
      updated_at = now()
  where id = p_deal_id;

  update public.poker_deal_bankroll_profiles
  set overall_bankroll = public.poker_stable_round_money(v_roll - v_amt)
  where deal_id = p_deal_id;

  if not p_skip_personal then
    perform public.poker_stable_credit_stakers_pro_rata(p_deal_id, v_amt);
  end if;

  return v_reduction_id;
end;
$$;

create or replace function public.poker_stable_write_reduction_ledger_for_user(
  p_reduction_id uuid,
  p_commit_id uuid,
  p_deal_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_red public.poker_stable_deal_reductions%rowtype;
  v_share numeric;
  v_msg text;
begin
  select * into v_red from public.poker_stable_deal_reductions where id = p_reduction_id;
  if v_red.id is null then
    return;
  end if;

  if not public.poker_stable_user_is_active_staker(p_deal_id, p_user_id) then
    return;
  end if;

  v_share := public.poker_stable_staker_share_amount(p_deal_id, v_red.amount, p_user_id);
  if v_share <= 0 then
    return;
  end if;

  v_msg := format(
    'Reduce stake %s: your personal bankroll was credited %s.',
    public.poker_stable_fmt_money(v_red.amount),
    public.poker_stable_fmt_money(v_share)
  );

  insert into public.poker_stable_ledger_entries (
    deal_id, commit_id, user_id, entry_kind, message
  )
  values (
    p_deal_id, p_commit_id, p_user_id, 'stake_reduction', v_msg
  );
end;
$$;

create or replace function public.poker_stable_write_topup_ledger_for_user(
  p_topup_id uuid,
  p_commit_id uuid,
  p_deal_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top public.poker_stable_deal_topups%rowtype;
  v_share numeric;
  v_msg text;
begin
  select * into v_top from public.poker_stable_deal_topups where id = p_topup_id;
  if v_top.id is null then
    return;
  end if;

  if not public.poker_stable_user_is_active_staker(p_deal_id, p_user_id) then
    return;
  end if;

  v_share := public.poker_stable_staker_share_amount(p_deal_id, v_top.amount, p_user_id);
  if v_share <= 0 then
    return;
  end if;

  v_msg := format(
    'Re-up %s: your personal bankroll was debited %s.',
    public.poker_stable_fmt_money(v_top.amount),
    public.poker_stable_fmt_money(v_share)
  );

  insert into public.poker_stable_ledger_entries (
    deal_id, commit_id, user_id, entry_kind, message
  )
  values (
    p_deal_id, p_commit_id, p_user_id, 'topup', v_msg
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Record + sync RPCs
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_record_topup(
  p_deal_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_topup_id uuid;
  v_commit_id uuid;
  v_summary text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.poker_stable_user_can_record_deal_event(p_deal_id, v_uid) then
    raise exception 'Not authorized to record top-up on this stake';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive amount.';
  end if;

  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);

  insert into public.poker_stable_deal_topups (
    deal_id, amount, funding_mode,
    baseline_before, baseline_after, roll_before, roll_after,
    logged_by_user_id, note
  )
  values (
    p_deal_id, v_amt, 'pro_rata',
    v_baseline, public.poker_stable_round_money(v_baseline + v_amt),
    v_roll, public.poker_stable_round_money(v_roll + v_amt),
    v_uid, nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_topup_id;

  update public.poker_stable_deals
  set baseline_bankroll = public.poker_stable_round_money(v_baseline + v_amt),
      updated_at = now()
  where id = p_deal_id;

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, public.poker_stable_round_money(v_roll + v_amt))
  on conflict (deal_id) do update
    set overall_bankroll = excluded.overall_bankroll;

  if public.poker_stable_user_is_active_staker(p_deal_id, v_uid) then
    perform public.poker_stable_debit_staker_share(p_deal_id, v_amt, v_uid);
    -- ledger written after commit id exists
  end if;

  v_summary := format('%s · Re-up %s recorded — sync to update your books', coalesce(v_deal.label, 'Stake'), public.poker_stable_fmt_money(v_amt));
  v_commit_id := public.poker_stable_record_commit(p_deal_id, v_uid, 'topup', v_topup_id, v_summary);

  if public.poker_stable_user_is_active_staker(p_deal_id, v_uid) then
    perform public.poker_stable_write_topup_ledger_for_user(v_topup_id, v_commit_id, p_deal_id, v_uid);
  end if;

  return v_topup_id;
end;
$$;

create or replace function public.poker_stable_record_reduction(
  p_deal_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reduction_id uuid;
  v_deal public.poker_stable_deals%rowtype;
  v_commit_id uuid;
  v_summary text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.poker_stable_user_can_record_deal_event(p_deal_id, v_uid) then
    raise exception 'Not authorized to record reduction on this stake';
  end if;

  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;

  v_reduction_id := public.poker_stable_apply_stake_reduction(
    p_deal_id,
    p_amount,
    v_uid,
    null,
    p_note,
    true
  );

  if public.poker_stable_user_is_active_staker(p_deal_id, v_uid) then
    perform public.poker_stable_credit_staker_share(p_deal_id, public.poker_stable_round_money(coalesce(p_amount, 0)), v_uid);
  end if;

  v_summary := format(
    '%s · Reduce stake %s recorded — sync to update your books',
    coalesce(v_deal.label, 'Stake'),
    public.poker_stable_fmt_money(coalesce(p_amount, 0))
  );
  v_commit_id := public.poker_stable_record_commit(p_deal_id, v_uid, 'reduction', v_reduction_id, v_summary);

  if public.poker_stable_user_is_active_staker(p_deal_id, v_uid) then
    perform public.poker_stable_write_reduction_ledger_for_user(v_reduction_id, v_commit_id, p_deal_id, v_uid);
  end if;

  return v_reduction_id;
end;
$$;

create or replace function public.poker_stable_record_settlement(
  p_deal_id uuid,
  p_finalize boolean default false,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_stake_reduction_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals%rowtype;
  v_reduction numeric;
  v_settlement_id uuid;
  v_commit_id uuid;
  v_kind text;
  v_event_kind text;
  v_summary text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.poker_stable_user_can_record_deal_event(p_deal_id, v_uid)
     and not exists (
       select 1 from public.poker_stable_deals d
       where d.id = p_deal_id
         and d.status = 'revoked'
         and (
           d.stakee_user_id = v_uid
           or public.poker_stable_user_is_active_staker(p_deal_id, v_uid)
         )
     ) then
    raise exception 'Not authorized to record settlement on this stake';
  end if;

  select * into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  if v_deal.status not in ('active', 'revoked') then
    raise exception 'Deal is not open for settlement';
  end if;

  if not p_finalize and v_deal.deal_type <> 'cash_backing' then
    raise exception 'Periodic settle applies to cash backing only';
  end if;

  v_reduction := public.poker_stable_round_money(greatest(0, coalesce(p_stake_reduction_total, 0)));
  if v_reduction > coalesce(v_deal.baseline_bankroll, 0) + 0.005 then
    raise exception 'Stake reduction cannot exceed baseline';
  end if;

  v_settlement_id := public.poker_stable_apply_settlement(
    p_deal_id,
    p_rakeback_total,
    p_note,
    p_finalize,
    v_uid,
    v_reduction
  );

  perform public.poker_stable_apply_settlement_personal(v_settlement_id, v_uid);

  if v_reduction > 0 and public.poker_stable_user_is_active_staker(p_deal_id, v_uid) then
    perform public.poker_stable_credit_staker_share(p_deal_id, v_reduction, v_uid);
  end if;

  v_kind := case when p_finalize then 'Close' else 'Periodic' end;
  v_event_kind := case when p_finalize then 'close_settle' else 'periodic_settle' end;
  v_summary := format(
    '%s · %s settlement recorded%s — sync to update your books',
    coalesce(v_deal.label, 'Stake'),
    v_kind,
    case when v_reduction > 0 then format(' · reduce %s', public.poker_stable_fmt_money(v_reduction)) else '' end
  );

  v_commit_id := public.poker_stable_record_commit(
    p_deal_id,
    v_uid,
    v_event_kind,
    v_settlement_id,
    v_summary
  );

  perform public.poker_stable_write_settlement_ledger_for_user(
    v_settlement_id,
    v_commit_id,
    p_deal_id,
    p_finalize,
    v_uid
  );

  return jsonb_build_object(
    'immediate', true,
    'settlement_id', v_settlement_id,
    'commit_id', v_commit_id,
    'request_id', null
  );
end;
$$;

create or replace function public.poker_stable_sync_commit(p_commit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_commit public.poker_stable_deal_commits%rowtype;
  v_top public.poker_stable_deal_topups%rowtype;
  v_red public.poker_stable_deal_reductions%rowtype;
  v_settlement_id uuid;
  v_reduction_amt numeric;
  v_finalize boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_commit
  from public.poker_stable_deal_commits c
  where c.id = p_commit_id
  for update;

  if v_commit.id is null then
    raise exception 'Commit not found';
  end if;

  if not public.poker_stable_user_can_access_deal(v_commit.deal_id, v_uid) then
    raise exception 'Not authorized';
  end if;

  if exists (
    select 1 from public.poker_stable_commit_syncs s
    where s.commit_id = p_commit_id and s.user_id = v_uid
  ) then
    return jsonb_build_object('status', 'already_synced');
  end if;

  if v_commit.event_kind = 'topup' then
    select * into v_top from public.poker_stable_deal_topups where id = v_commit.ref_id;
    if public.poker_stable_user_is_active_staker(v_commit.deal_id, v_uid) then
      perform public.poker_stable_debit_staker_share(v_commit.deal_id, v_top.amount, v_uid);
      perform public.poker_stable_write_topup_ledger_for_user(v_top.id, p_commit_id, v_commit.deal_id, v_uid);
    end if;

  elsif v_commit.event_kind = 'reduction' then
    select * into v_red from public.poker_stable_deal_reductions where id = v_commit.ref_id;
    if public.poker_stable_user_is_active_staker(v_commit.deal_id, v_uid) then
      perform public.poker_stable_credit_staker_share(v_commit.deal_id, v_red.amount, v_uid);
      perform public.poker_stable_write_reduction_ledger_for_user(v_red.id, p_commit_id, v_commit.deal_id, v_uid);
    end if;

  elsif v_commit.event_kind in ('periodic_settle', 'close_settle') then
    v_settlement_id := v_commit.ref_id;
    v_finalize := v_commit.event_kind = 'close_settle';
    perform public.poker_stable_apply_settlement_personal(v_settlement_id, v_uid);

    select coalesce(st.stake_reduction_total, 0) into v_reduction_amt
    from public.poker_stable_deal_settlements st
    where st.id = v_settlement_id;

    if v_reduction_amt > 0 and public.poker_stable_user_is_active_staker(v_commit.deal_id, v_uid) then
      perform public.poker_stable_credit_staker_share(v_commit.deal_id, v_reduction_amt, v_uid);
    end if;

    perform public.poker_stable_write_settlement_ledger_for_user(
      v_settlement_id,
      p_commit_id,
      v_commit.deal_id,
      v_finalize,
      v_uid
    );
  else
    raise exception 'Unknown commit kind';
  end if;

  perform public.poker_stable_insert_commit_sync(p_commit_id, v_uid);

  return jsonb_build_object('status', 'synced');
end;
$$;

create or replace function public.poker_stable_pending_commits(p_deal_id uuid default null)
returns table (
  commit_id uuid,
  deal_id uuid,
  event_kind text,
  ref_id uuid,
  summary text,
  recorded_by_user_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.deal_id,
    c.event_kind,
    c.ref_id,
    c.summary,
    c.recorded_by_user_id,
    c.created_at
  from public.poker_stable_deal_commits c
  where public.poker_stable_user_can_access_deal(c.deal_id, auth.uid())
    and c.recorded_by_user_id <> auth.uid()
    and not exists (
      select 1 from public.poker_stable_commit_syncs s
      where s.commit_id = c.id and s.user_id = auth.uid()
    )
    and (p_deal_id is null or c.deal_id = p_deal_id)
  order by c.created_at desc;
$$;

-- Backward-compatible wrappers (UI/API names)
create or replace function public.poker_stable_propose_settlement(
  p_deal_id uuid,
  p_finalize boolean default false,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_stake_reduction_total numeric default 0
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.poker_stable_record_settlement(
    p_deal_id,
    p_finalize,
    p_rakeback_total,
    p_note,
    p_stake_reduction_total
  );
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
begin
  raise exception 'Settlement votes are retired — use poker_stable_sync_commit on the commit alert instead';
end;
$$;

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
  v_result := public.poker_stable_record_settlement(p_deal_id, false, p_rakeback_total, p_note, 0);
  return (v_result->>'settlement_id')::uuid;
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
  v_result := public.poker_stable_record_settlement(p_deal_id, true, p_rakeback_total, p_note, 0);
  return (v_result->>'settlement_id')::uuid;
end;
$$;

-- Cancel any stale pending settlement requests (legacy rows)
update public.poker_stable_settlement_requests
set status = 'cancelled',
    finalized_at = coalesce(finalized_at, now())
where status = 'pending';

-- lounge_activity_events_page: expose commit id for sync deep links
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
  poker_stable_settlement_request_id uuid,
  poker_stable_commit_id uuid
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
    ae.poker_stable_settlement_request_id,
    ae.poker_stable_commit_id
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

revoke all on function public.poker_stable_record_settlement(uuid, boolean, numeric, text, numeric) from public;
revoke all on function public.poker_stable_sync_commit(uuid) from public;
revoke all on function public.poker_stable_pending_commits(uuid) from public;

grant execute on function public.poker_stable_record_settlement(uuid, boolean, numeric, text, numeric) to authenticated;
grant execute on function public.poker_stable_sync_commit(uuid) to authenticated;
grant execute on function public.poker_stable_pending_commits(uuid) to authenticated;

commit;
