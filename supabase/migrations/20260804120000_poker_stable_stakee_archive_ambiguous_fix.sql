-- Fix stakee archive: PL/pgSQL record `d` collided with UPDATE alias `d` ("d.id is ambiguous").

create or replace function public.poker_stable_stakee_archive_bankroll_deal(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.poker_stable_deals deal_row
  set stakee_bankroll_archived_at = now()
  where deal_row.id = p_deal_id
    and deal_row.stakee_user_id = v_uid
    and deal_row.status in ('settled', 'declined', 'revoked', 'closed')
  returning * into v_deal;

  if not found then
    raise exception 'Stake cannot be archived yet';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_id', v_deal.id,
    'stakee_bankroll_archived_at', v_deal.stakee_bankroll_archived_at
  );
end;
$$;

revoke all on function public.poker_stable_stakee_archive_bankroll_deal(uuid) from public;
grant execute on function public.poker_stable_stakee_archive_bankroll_deal(uuid) to authenticated;
