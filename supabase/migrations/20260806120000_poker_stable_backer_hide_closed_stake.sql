-- Backer soft-delete of Closed stakes: hide from Stable history without hard-deleting shared deal rows.

alter table public.poker_stable_deal_slices
  add column if not exists stable_hidden_at timestamptz;

comment on column public.poker_stable_deal_slices.stable_hidden_at is
  'When set by the slice backer, this deal is removed from their Closed stakes list (and carousel). Soft hide only; deal/ledger rows remain for the counterparty.';

create or replace function public.poker_stable_backer_hide_stable_deal(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.poker_stable_deal_slices s
  set
    stable_archived_at = coalesce(s.stable_archived_at, now()),
    stable_hidden_at = now()
  from public.poker_stable_deals d
  where s.deal_id = p_deal_id
    and d.id = s.deal_id
    and s.staker_user_id = v_uid
    and s.stable_hidden_at is null
    and d.status in ('settled', 'declined', 'revoked', 'closed')
  ;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Stake cannot be deleted from Closed stakes';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'hidden_slice_count', v_count
  );
end;
$$;

revoke all on function public.poker_stable_backer_hide_stable_deal(uuid) from public;
grant execute on function public.poker_stable_backer_hide_stable_deal(uuid) to authenticated;
