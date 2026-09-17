-- Sell Action / piece-deal guest backers insert as active (live terms immediately).
-- Copy-invite mint still needs to work until they link an Edge account.

create or replace function public.poker_stable_guest_backer_mint_invite_link(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  sl public.poker_stable_deal_slices;
  d public.poker_stable_deals;
  raw text;
  th text;
  invite_email text;
  can_mint boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to copy this invite';
  end if;
  if p_slice_id is null then
    raise exception 'slice not found';
  end if;

  select * into sl
  from public.poker_stable_deal_slices
  where id = p_slice_id
  for update;
  if not found then
    raise exception 'slice not found';
  end if;

  select * into d
  from public.poker_stable_deals
  where id = sl.deal_id
  for update;
  if not found then
    raise exception 'stake not found';
  end if;
  if d.status in ('cancelled', 'declined', 'revoked') then
    raise exception 'This stake is not available to invite';
  end if;
  if sl.counterparty_kind <> 'guest' then
    raise exception 'This slice is already an Edge backer invite';
  end if;
  if sl.staker_user_id is not null then
    raise exception 'This backer already linked an Edge account';
  end if;
  if public.et_is_deleted_party_label(sl.guest_label) then
    raise exception 'This backing slice belongs to a deleted account';
  end if;
  if sl.status not in ('pending', 'proposed', 'active') then
    raise exception 'This slice is not waiting on an invite';
  end if;

  can_mint :=
    (d.stakee_user_id is not null and d.stakee_user_id = v_uid)
    or (d.staker_user_id is not null and d.staker_user_id = v_uid);
  if not can_mint then
    raise exception 'Only the player or lead backer can copy this backer invite';
  end if;

  raw := public.poker_guest_invite_new_token();
  th := encode(digest(raw, 'sha256'), 'hex');
  invite_email := nullif(lower(trim(sl.guest_email)), '');

  insert into public.poker_stable_guest_backer_claim_tokens (
    slice_id, token_hash, guest_email, expires_at
  ) values (
    sl.id,
    th,
    invite_email,
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'token', raw,
    'path', '/poker-stable-claim'
  );
end;
$$;

revoke all on function public.poker_stable_guest_backer_mint_invite_link(uuid) from public;
grant execute on function public.poker_stable_guest_backer_mint_invite_link(uuid) to authenticated, service_role;

comment on function public.poker_stable_guest_backer_mint_invite_link(uuid) is
  'Mint a copy-link claim token for an unclaimed guest backer slice (pending, proposed, or active).';
