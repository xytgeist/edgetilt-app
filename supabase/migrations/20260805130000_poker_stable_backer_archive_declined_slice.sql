-- Backer archive: include declined slices on terminal deals (revoke sets slice -> declined).

create or replace function public.poker_stable_backer_archive_stable_deal(p_deal_id uuid)
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
  set stable_archived_at = now()
  from public.poker_stable_deals d
  where s.deal_id = p_deal_id
    and d.id = s.deal_id
    and s.staker_user_id = v_uid
    and s.stable_archived_at is null
    and d.status in ('settled', 'declined', 'revoked', 'closed')
  ;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Stake cannot be archived yet';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'archived_slice_count', v_count
  );
end;
$$;

revoke all on function public.poker_stable_backer_archive_stable_deal(uuid) from public;
grant execute on function public.poker_stable_backer_archive_stable_deal(uuid) to authenticated;
