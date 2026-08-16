-- Stakee Bankroll archive delete:
-- hide a closed/archived stake from the stakee's Bankroll Archive without deleting the
-- shared deal/audit rows; optionally hide its sessions from the stakee's merged personal
-- history and metrics. Backers' Stable history remains intact.

begin;

alter table public.poker_stable_deals
  add column if not exists stakee_bankroll_hidden_at timestamptz,
  add column if not exists stakee_personal_history_hidden_at timestamptz;

comment on column public.poker_stable_deals.stakee_bankroll_hidden_at is
  'Stakee-only soft delete from Poker Bankroll Archive; shared stake/backer history remains.';

comment on column public.poker_stable_deals.stakee_personal_history_hidden_at is
  'When set by the stakee, this deal''s sessions no longer appear in merged personal bankroll history/metrics.';

create or replace function public.poker_stable_stakee_hide_archived_deal(
  p_deal_id uuid,
  p_hide_personal_sessions boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals;
  v_session_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.poker_stable_deals d
  set
    stakee_bankroll_hidden_at = coalesce(d.stakee_bankroll_hidden_at, now()),
    stakee_personal_history_hidden_at = case
      when coalesce(p_hide_personal_sessions, false)
        then coalesce(d.stakee_personal_history_hidden_at, now())
      else d.stakee_personal_history_hidden_at
    end
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.stakee_bankroll_archived_at is not null
    and d.status in ('settled', 'declined', 'revoked', 'closed')
  returning * into v_deal;

  if not found then
    raise exception 'Archived stake not found';
  end if;

  if coalesce(p_hide_personal_sessions, false) then
    select count(*)::integer
    into v_session_count
    from public.poker_bankroll_sessions s
    where s.deal_id = p_deal_id
      and s.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_id', v_deal.id,
    'stakee_bankroll_hidden_at', v_deal.stakee_bankroll_hidden_at,
    'stakee_personal_history_hidden_at', v_deal.stakee_personal_history_hidden_at,
    'hidden_personal_session_count', v_session_count
  );
end;
$$;

comment on function public.poker_stable_stakee_hide_archived_deal(uuid, boolean) is
  'Stakee soft-deletes an archived stake from Bankroll and may also hide its sessions from merged personal history; shared deal/session audit rows and balances remain intact.';

revoke all on function public.poker_stable_stakee_hide_archived_deal(uuid, boolean) from public;
grant execute on function public.poker_stable_stakee_hide_archived_deal(uuid, boolean) to authenticated;

commit;
