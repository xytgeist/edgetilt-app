-- Guest swap/stake invites: mint a claim token the creator can copy into their own
-- text. Carriers rejected our leased-number 10DLC (gambling 704). Email notify
-- stays optional. Apply on TEST first. Do not apply to production without Ryan's ask.

create or replace function public.poker_guest_invite_new_token()
returns text
language sql
volatile
security definer
set search_path = public, extensions
as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

revoke all on function public.poker_guest_invite_new_token() from public;
grant execute on function public.poker_guest_invite_new_token() to service_role;

create or replace function public.poker_tournament_swap_mint_invite_link(p_swap_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  s public.poker_tournament_swaps;
  raw text;
  th text;
  invite_email text;
begin
  if v_uid is null then
    raise exception 'Sign in to copy this invite';
  end if;
  if p_swap_id is null then
    raise exception 'swap not found';
  end if;

  select * into s
  from public.poker_tournament_swaps
  where id = p_swap_id
  for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.creator_user_id <> v_uid then
    raise exception 'Only the person who created this swap can copy the invite';
  end if;
  if s.status = 'cancelled' then
    raise exception 'This swap was cancelled';
  end if;
  if s.counterparty_kind <> 'guest' then
    raise exception 'This swap is already an Edge user invite';
  end if;
  if s.counterparty_user_id is not null then
    raise exception 'This swap is already linked to an Edge account';
  end if;

  raw := public.poker_guest_invite_new_token();
  th := encode(digest(raw, 'sha256'), 'hex');
  invite_email := nullif(lower(trim(s.counterparty_guest_email)), '');

  insert into public.poker_tournament_swap_claim_tokens (
    swap_id, token_hash, expires_at, guest_email
  ) values (
    s.id,
    th,
    now() + interval '30 days',
    invite_email
  );

  return jsonb_build_object(
    'token', raw,
    'path', '/poker-swap-claim'
  );
end;
$$;

revoke all on function public.poker_tournament_swap_mint_invite_link(uuid) from public;
grant execute on function public.poker_tournament_swap_mint_invite_link(uuid) to authenticated, service_role;

comment on function public.poker_tournament_swap_mint_invite_link(uuid) is
  'Creator mints a guest tournament-swap claim URL to copy into their own text. Does not send SMS.';

create or replace function public.poker_stable_guest_stakee_mint_invite_link(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  d public.poker_stable_deals;
  raw text;
  th text;
  invite_email text;
begin
  if v_uid is null then
    raise exception 'Sign in to copy this invite';
  end if;
  if p_deal_id is null then
    raise exception 'stake not found';
  end if;

  select * into d
  from public.poker_stable_deals
  where id = p_deal_id
  for update;
  if not found then
    raise exception 'stake not found';
  end if;
  if d.status in ('cancelled', 'declined', 'revoked') then
    raise exception 'This stake is not available to invite';
  end if;
  if d.staker_user_id is null or d.staker_user_id <> v_uid then
    raise exception 'Only the backer who created this stake can copy the player invite';
  end if;
  if d.stakee_user_id is not null then
    raise exception 'This player already linked an Edge account';
  end if;
  if coalesce(nullif(trim(d.stakee_guest_label), ''), '') = '' then
    raise exception 'This stake has no guest player';
  end if;
  if not public.poker_stable_deal_is_backer_initiated(d.id) then
    raise exception 'Player invites are for backer-created guest horses only';
  end if;

  raw := public.poker_guest_invite_new_token();
  th := encode(digest(raw, 'sha256'), 'hex');
  invite_email := nullif(lower(trim(d.stakee_guest_email)), '');

  insert into public.poker_stable_guest_stakee_claim_tokens (
    deal_id, token_hash, guest_email, expires_at
  ) values (
    d.id,
    th,
    invite_email,
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'token', raw,
    'path', '/poker-stake-claim'
  );
end;
$$;

revoke all on function public.poker_stable_guest_stakee_mint_invite_link(uuid) from public;
grant execute on function public.poker_stable_guest_stakee_mint_invite_link(uuid) to authenticated, service_role;

comment on function public.poker_stable_guest_stakee_mint_invite_link(uuid) is
  'Lead backer mints a guest-player claim URL to copy into their own text. Does not send SMS.';

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
  if sl.status not in ('pending', 'proposed') then
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
  'Player or lead backer mints a guest-backer claim URL to copy into their own text. Does not send SMS.';
