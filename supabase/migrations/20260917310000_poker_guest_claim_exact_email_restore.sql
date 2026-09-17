-- Roll back 20260917300000. Gmail-dot vs Google canonical is a tester
-- setup issue, not a product OAuth bug. Invite email stays exact.

create or replace function public.poker_stable_guest_backer_claim_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  th text;
  tok public.poker_stable_guest_backer_claim_tokens;
  sl public.poker_stable_deal_slices;
  d public.poker_stable_deals;
  auth_email text;
begin
  if v_uid is null then
    raise exception 'Sign in to claim this backing slice';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;

  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_stable_guest_backer_claim_tokens
  where token_hash = th
  for update;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into sl from public.poker_stable_deal_slices where id = tok.slice_id for update;
  if not found then
    raise exception 'slice not found';
  end if;

  select * into d from public.poker_stable_deals where id = sl.deal_id for update;
  if not found or d.status not in ('pending', 'active', 'draft') then
    raise exception 'stake not available to claim';
  end if;
  if not (
    public.poker_stable_deal_is_player_initiated(d.id)
    or public.poker_stable_is_syndicate_guest_backer_slice(d, sl)
  ) then
    raise exception 'claim link is not valid for this slice';
  end if;
  if d.stakee_user_id = v_uid then
    raise exception 'You cannot back your own stake';
  end if;

  if sl.counterparty_kind = 'user' and sl.staker_user_id is not null and sl.staker_user_id <> v_uid then
    raise exception 'This backing slice is already linked to another Edge account';
  end if;

  if sl.counterparty_kind = 'guest' or sl.staker_user_id is null then
    select lower(trim(u.email))
    into auth_email
    from auth.users u
    where u.id = v_uid;

    if coalesce(trim(tok.guest_email), '') <> ''
      and auth_email is not null
      and lower(trim(tok.guest_email)) <> auth_email then
      raise exception 'Sign in with the email address this invitation was sent to';
    end if;

    if exists (
      select 1
      from public.poker_stable_deal_slices s
      where s.deal_id = d.id
        and s.staker_user_id = v_uid
        and s.id <> sl.id
    ) then
      raise exception 'You already have a slice on this stake';
    end if;

    update public.poker_stable_deal_slices
    set
      counterparty_kind = 'user',
      staker_user_id = v_uid,
      guest_phone = null,
      guest_email = null,
      status = 'pending',
      responded_at = null
    where id = sl.id;
  end if;

  update public.poker_stable_guest_backer_claim_tokens
  set
    claimed_at = coalesce(claimed_at, now()),
    claimed_by_user_id = v_uid
  where id = tok.id;

  return jsonb_build_object(
    'ok', true,
    'slice_id', sl.id,
    'deal_id', d.id,
    'redirect', '/?tab=poker-stable&stableDeal=' || d.id::text
  );
end;
$$;

revoke all on function public.poker_stable_guest_backer_claim_link(text) from public;
grant execute on function public.poker_stable_guest_backer_claim_link(text) to authenticated, service_role;

create or replace function public.poker_stable_guest_backer_claim_by_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  auth_email text;
  linked_ids uuid[] := array[]::uuid[];
  sl record;
  first_deal_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to link guest backing slices';
  end if;

  select lower(trim(u.email))
  into auth_email
  from auth.users u
  where u.id = v_uid;

  if coalesce(auth_email, '') = '' then
    return jsonb_build_object('ok', true, 'slice_ids', linked_ids, 'redirect', null);
  end if;

  for sl in
    select s.id as slice_id, s.deal_id
    from public.poker_stable_deal_slices s
    join public.poker_stable_deals d on d.id = s.deal_id
    where s.counterparty_kind = 'guest'
      and (
        lower(trim(coalesce(s.guest_email, ''))) = auth_email
        or exists (
          select 1
          from public.poker_stable_guest_backer_claim_tokens t
          where t.slice_id = s.id
            and t.claimed_at is null
            and t.expires_at > now()
            and lower(trim(coalesce(t.guest_email, ''))) = auth_email
        )
      )
      and d.status in ('pending', 'active', 'draft')
      and (
        (
          d.stakee_user_id is not null
          and d.stakee_user_id <> v_uid
          and public.poker_stable_deal_is_player_initiated(d.id)
        )
        or public.poker_stable_is_syndicate_guest_backer_slice(d, s)
      )
      and not exists (
        select 1
        from public.poker_stable_deal_slices x
        where x.deal_id = s.deal_id
          and x.staker_user_id = v_uid
      )
    order by s.slice_index asc
    for update of s
  loop
    update public.poker_stable_deal_slices
    set
      counterparty_kind = 'user',
      staker_user_id = v_uid,
      guest_phone = null,
      guest_email = null,
      status = 'pending',
      responded_at = null
    where id = sl.slice_id;

    linked_ids := array_append(linked_ids, sl.slice_id);
    if first_deal_id is null then
      first_deal_id := sl.deal_id;
    end if;
  end loop;

  if array_length(linked_ids, 1) is not null then
    update public.poker_stable_guest_backer_claim_tokens t
    set
      claimed_at = coalesce(t.claimed_at, now()),
      claimed_by_user_id = v_uid
    where t.slice_id = any(linked_ids)
      and t.claimed_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'slice_ids', linked_ids,
    'redirect',
      case
        when first_deal_id is not null then '/?tab=poker-stable&stableDeal=' || first_deal_id::text
        else null
      end
  );
end;
$$;

revoke all on function public.poker_stable_guest_backer_claim_by_email() from public;
grant execute on function public.poker_stable_guest_backer_claim_by_email() to authenticated, service_role;

create or replace function public.poker_stable_guest_stakee_claim_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  th text;
  tok public.poker_stable_guest_stakee_claim_tokens;
  d public.poker_stable_deals;
  auth_email text;
begin
  if v_uid is null then
    raise exception 'Sign in to claim this stake';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;

  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_stable_guest_stakee_claim_tokens
  where token_hash = th
  for update;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into d from public.poker_stable_deals where id = tok.deal_id for update;
  if not found or d.status not in ('pending', 'active') then
    raise exception 'stake not available to claim';
  end if;
  if not public.poker_stable_deal_is_backer_initiated(d.id) then
    raise exception 'claim link is for backer-initiated stakes only';
  end if;

  if d.stakee_user_id is not null and d.stakee_user_id <> v_uid then
    raise exception 'This stake is already linked to another Edge account';
  end if;

  if d.stakee_user_id is null then
    select lower(trim(u.email))
    into auth_email
    from auth.users u
    where u.id = v_uid;

    if coalesce(trim(tok.guest_email), '') <> ''
      and auth_email is not null
      and lower(trim(tok.guest_email)) <> auth_email then
      raise exception 'Sign in with the email address this invitation was sent to';
    end if;

    update public.poker_stable_deals
    set
      stakee_user_id = v_uid,
      stakee_guest_phone = null,
      stakee_guest_email = null
    where id = d.id;

    perform public.poker_stable_emit_activity_event(
      v_uid,
      d.staker_user_id,
      'poker_stable_backer_offer',
      d.id,
      null,
      coalesce(d.label, 'Backing offer')
    );
  end if;

  update public.poker_stable_guest_stakee_claim_tokens
  set
    claimed_at = coalesce(claimed_at, now()),
    claimed_by_user_id = v_uid
  where id = tok.id;

  return jsonb_build_object(
    'ok', true,
    'deal_id', d.id,
    'redirect', '/?tab=poker-bankroll&stableDeal=' || d.id::text
  );
end;
$$;

revoke all on function public.poker_stable_guest_stakee_claim_link(text) from public;
grant execute on function public.poker_stable_guest_stakee_claim_link(text) to authenticated, service_role;

create or replace function public.poker_stable_guest_stakee_claim_by_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  auth_email text;
  linked_ids uuid[] := array[]::uuid[];
  d record;
  first_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to link guest stakes';
  end if;

  select lower(trim(u.email))
  into auth_email
  from auth.users u
  where u.id = v_uid;

  if coalesce(auth_email, '') = '' then
    return jsonb_build_object('ok', true, 'deal_ids', linked_ids, 'redirect', null);
  end if;

  for d in
    select deal.id
    from public.poker_stable_deals deal
    where deal.stakee_user_id is null
      and deal.status in ('pending', 'active')
      and lower(trim(coalesce(deal.stakee_guest_email, ''))) = auth_email
      and public.poker_stable_deal_is_backer_initiated(deal.id)
    order by deal.created_at desc
    for update of deal
  loop
    update public.poker_stable_deals
    set
      stakee_user_id = v_uid,
      stakee_guest_label = null,
      stakee_guest_phone = null,
      stakee_guest_email = null
    where id = d.id;

    linked_ids := array_append(linked_ids, d.id);
    if first_id is null then
      first_id := d.id;
    end if;
  end loop;

  if array_length(linked_ids, 1) is not null then
    update public.poker_stable_guest_stakee_claim_tokens t
    set
      claimed_at = coalesce(t.claimed_at, now()),
      claimed_by_user_id = v_uid
    where t.deal_id = any(linked_ids)
      and t.claimed_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_ids', linked_ids,
    'redirect',
      case
        when first_id is not null then '/?tab=poker-bankroll&stableDeal=' || first_id::text
        else null
      end
  );
end;
$$;

revoke all on function public.poker_stable_guest_stakee_claim_by_email() from public;
grant execute on function public.poker_stable_guest_stakee_claim_by_email() to authenticated, service_role;

create or replace function public.poker_tournament_swap_claim_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  th text;
  tok public.poker_tournament_swap_claim_tokens;
  s public.poker_tournament_swaps;
  auth_email text;
  invite_email text;
  already boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to claim this swap';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;

  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_tournament_swap_claim_tokens
  where token_hash = th
  for update;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into s from public.poker_tournament_swaps where id = tok.swap_id for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    raise exception 'This swap was cancelled';
  end if;

  if s.counterparty_kind = 'user'
     and s.counterparty_user_id is not null
     and s.counterparty_user_id = v_uid then
    already := true;
    update public.poker_tournament_swap_claim_tokens
    set
      claimed_at = coalesce(claimed_at, now()),
      claimed_by_user_id = v_uid
    where id = tok.id;
  else
    select lower(trim(u.email))
    into auth_email
    from auth.users u
    where u.id = v_uid;

    invite_email := coalesce(
      nullif(lower(trim(tok.guest_email)), ''),
      nullif(lower(trim(s.counterparty_guest_email)), '')
    );
    if invite_email is not null
       and auth_email is not null
       and invite_email <> auth_email then
      raise exception 'Sign in with the email address this invitation was sent to';
    end if;

    s := public.poker_tournament_swap_attach_counterparty_user(s.id, v_uid);
  end if;

  return jsonb_build_object(
    'ok', true,
    'swap_id', s.id,
    'already_linked', already,
    'redirect', '/?tab=poker-bankroll&tournamentSwap=' || s.id::text
  );
end;
$$;

revoke all on function public.poker_tournament_swap_claim_link(text) from public;
grant execute on function public.poker_tournament_swap_claim_link(text) to authenticated, service_role;

create or replace function public.poker_tournament_swap_claim_by_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  auth_email text;
  linked_ids uuid[] := array[]::uuid[];
  r record;
  first_id uuid;
  s public.poker_tournament_swaps;
begin
  if v_uid is null then
    raise exception 'Sign in to link guest swaps';
  end if;

  select lower(trim(u.email))
  into auth_email
  from auth.users u
  where u.id = v_uid;

  if coalesce(auth_email, '') = '' then
    return jsonb_build_object('ok', true, 'swap_ids', linked_ids, 'redirect', null);
  end if;

  for r in
    select x.id
    from (
      select s.id, max(s.created_at) as created_at
      from public.poker_tournament_swaps s
      left join public.poker_tournament_swap_claim_tokens t
        on t.swap_id = s.id
       and t.claimed_at is null
       and t.expires_at >= now()
      where s.counterparty_kind = 'guest'
        and s.counterparty_user_id is null
        and s.status in ('active', 'settled')
        and s.creator_user_id <> v_uid
        and (
          lower(trim(coalesce(s.counterparty_guest_email, ''))) = auth_email
          or lower(trim(coalesce(t.guest_email, ''))) = auth_email
        )
      group by s.id
    ) x
    order by x.created_at desc
  loop
    s := public.poker_tournament_swap_attach_counterparty_user(r.id, v_uid);
    linked_ids := array_append(linked_ids, s.id);
    if first_id is null then
      first_id := s.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'swap_ids', linked_ids,
    'redirect',
      case
        when first_id is not null then '/?tab=poker-bankroll&tournamentSwap=' || first_id::text
        else null
      end
  );
end;
$$;

revoke all on function public.poker_tournament_swap_claim_by_email() from public;
grant execute on function public.poker_tournament_swap_claim_by_email() to authenticated, service_role;

drop function if exists public.et_invite_email_matches_auth_user(text, uuid);
drop function if exists public.et_auth_user_emails(uuid);
drop function if exists public.et_gmail_mailbox_key(text);

comment on function public.poker_tournament_swap_claim_link(text) is
  'Authenticated guest invite link: convert tournament swap counterparty to Edge user. Invite email must match the signed-in address exactly.';
comment on function public.poker_tournament_swap_claim_by_email() is
  'Link guest tournament swaps whose invitation email matches the signed-in account exactly.';
