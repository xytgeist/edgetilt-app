-- Stakee Bankroll: manual archive after close/decline (carousel until archived).
-- When a backer closes a stake, auto-apply the stakee's settlement sync so they are not
-- prompted to "Commit to my books" for a backer-only close event.

alter table public.poker_stable_deals
  add column if not exists stakee_bankroll_archived_at timestamptz;

comment on column public.poker_stable_deals.stakee_bankroll_archived_at is
  'When set by the stakee, the deal leaves Poker Bankroll carousel and appears under Archive.';

create or replace function public.poker_stable_stakee_archive_bankroll_deal(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d public.poker_stable_deals;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.poker_stable_deals d
  set stakee_bankroll_archived_at = now()
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status in ('settled', 'declined', 'revoked', 'closed')
  returning * into d;

  if not found then
    raise exception 'Stake cannot be archived yet';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_id', d.id,
    'stakee_bankroll_archived_at', d.stakee_bankroll_archived_at
  );
end;
$$;

revoke all on function public.poker_stable_stakee_archive_bankroll_deal(uuid) from public;
grant execute on function public.poker_stable_stakee_archive_bankroll_deal(uuid) to authenticated;

-- After a counterparty records close settlement, apply the stakee side immediately (no pending commit).
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

  if p_finalize
     and v_deal.stakee_user_id is not null
     and v_deal.stakee_user_id <> v_uid then
    perform public.poker_stable_apply_settlement_personal(v_settlement_id, v_deal.stakee_user_id);
    perform public.poker_stable_write_settlement_ledger_for_user(
      v_settlement_id,
      v_commit_id,
      p_deal_id,
      true,
      v_deal.stakee_user_id
    );
    perform public.poker_stable_insert_commit_sync(v_commit_id, v_deal.stakee_user_id);
  end if;

  return jsonb_build_object(
    'immediate', true,
    'settlement_id', v_settlement_id,
    'commit_id', v_commit_id,
    'request_id', null
  );
end;
$$;
