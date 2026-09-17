-- Guest claim email gate: Google/Apple may store a different string than the
-- invite (Gmail dots / plus-tags, identity email vs users.email).
-- Email+password stays exact so dotted Gmail testers remain separate Auth users.

create or replace function public.et_gmail_mailbox_key(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  at int;
  local text;
  domain text;
begin
  if e = '' then
    return null;
  end if;
  at := position('@' in e);
  if at < 2 then
    return null;
  end if;
  local := left(e, at - 1);
  domain := substring(e from at + 1);
  if domain not in ('gmail.com', 'googlemail.com') then
    return null;
  end if;
  local := split_part(local, '+', 1);
  local := replace(local, '.', '');
  if local = '' then
    return null;
  end if;
  return local || '@gmail.com';
end;
$$;

create or replace function public.et_auth_user_emails(p_uid uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct e) filter (where e is not null and e <> ''),
    array[]::text[]
  )
  from (
    select lower(trim(u.email)) as e
    from auth.users u
    where u.id = p_uid
    union
    select lower(trim(coalesce(i.identity_data->>'email', '')))
    from auth.identities i
    where i.user_id = p_uid
  ) s;
$$;

create or replace function public.et_invite_email_matches_auth_user(p_invite text, p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  invite text := lower(trim(coalesce(p_invite, '')));
  emails text[];
  e text;
  invite_key text;
  auth_key text;
  has_oauth boolean := false;
begin
  if invite = '' or p_uid is null then
    return false;
  end if;

  emails := public.et_auth_user_emails(p_uid);
  if invite = any (emails) then
    return true;
  end if;

  select exists (
    select 1
    from auth.identities i
    where i.user_id = p_uid
      and i.provider in ('google', 'apple')
  )
  into has_oauth;

  if not has_oauth then
    return false;
  end if;

  invite_key := public.et_gmail_mailbox_key(invite);
  if invite_key is null then
    return false;
  end if;

  foreach e in array emails
  loop
    auth_key := public.et_gmail_mailbox_key(e);
    if auth_key is not null and auth_key = invite_key then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.et_gmail_mailbox_key(text) from public;
revoke all on function public.et_auth_user_emails(uuid) from public;
revoke all on function public.et_invite_email_matches_auth_user(text, uuid) from public;

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
    if coalesce(trim(tok.guest_email), '') <> ''
      and not public.et_invite_email_matches_auth_user(tok.guest_email, v_uid) then
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
  linked_ids uuid[] := array[]::uuid[];
  sl record;
  first_deal_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to link guest backing slices';
  end if;

  if coalesce(array_length(public.et_auth_user_emails(v_uid), 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'slice_ids', linked_ids, 'redirect', null);
  end if;

  for sl in
    select s.id as slice_id, s.deal_id
    from public.poker_stable_deal_slices s
    join public.poker_stable_deals d on d.id = s.deal_id
    where s.counterparty_kind = 'guest'
      and (
        public.et_invite_email_matches_auth_user(s.guest_email, v_uid)
        or exists (
          select 1
          from public.poker_stable_guest_backer_claim_tokens t
          where t.slice_id = s.id
            and t.claimed_at is null
            and t.expires_at > now()
            and public.et_invite_email_matches_auth_user(t.guest_email, v_uid)
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
    if coalesce(trim(tok.guest_email), '') <> ''
      and not public.et_invite_email_matches_auth_user(tok.guest_email, v_uid) then
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
  linked_ids uuid[] := array[]::uuid[];
  d record;
  first_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to link guest stakes';
  end if;

  if coalesce(array_length(public.et_auth_user_emails(v_uid), 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'deal_ids', linked_ids, 'redirect', null);
  end if;

  for d in
    select deal.id
    from public.poker_stable_deals deal
    where deal.stakee_user_id is null
      and deal.status in ('pending', 'active')
      and public.et_invite_email_matches_auth_user(deal.stakee_guest_email, v_uid)
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
    invite_email := coalesce(
      nullif(lower(trim(tok.guest_email)), ''),
      nullif(lower(trim(s.counterparty_guest_email)), '')
    );
    if invite_email is not null
       and not public.et_invite_email_matches_auth_user(invite_email, v_uid) then
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
  linked_ids uuid[] := array[]::uuid[];
  r record;
  first_id uuid;
  s public.poker_tournament_swaps;
begin
  if v_uid is null then
    raise exception 'Sign in to link guest swaps';
  end if;

  if coalesce(array_length(public.et_auth_user_emails(v_uid), 1), 0) = 0 then
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
          public.et_invite_email_matches_auth_user(s.counterparty_guest_email, v_uid)
          or public.et_invite_email_matches_auth_user(t.guest_email, v_uid)
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

comment on function public.et_invite_email_matches_auth_user(text, uuid) is
  'Invite email vs signed-in Auth user. Exact match always. Google/Apple also match Gmail dots and plus-tags. Email+password stays exact.';

comment on function public.poker_tournament_swap_claim_link(text) is
  'Authenticated guest invite link. Email+password must match exactly; Google/Apple may match the same Gmail mailbox.';

comment on function public.poker_tournament_swap_claim_by_email() is
  'Link guest tournament swaps whose invitation email matches the signed-in account (OAuth Gmail mailbox included).';
