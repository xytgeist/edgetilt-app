-- Phase 1b: backer Create Stake → guest syndicate co-backer claim + Edge co-backer invite copy.

begin;

create or replace function public.poker_stable_is_syndicate_guest_backer_slice(
  p_deal public.poker_stable_deals,
  p_slice public.poker_stable_deal_slices
) returns boolean
language sql
stable
as $$
  select p_deal.staker_user_id is not null
    and p_slice.counterparty_kind = 'guest'
    and p_slice.slice_index > 0
    and p_slice.status in ('pending', 'proposed');
$$;

revoke all on function public.poker_stable_is_syndicate_guest_backer_slice(public.poker_stable_deals, public.poker_stable_deal_slices) from public;
grant execute on function public.poker_stable_is_syndicate_guest_backer_slice(public.poker_stable_deals, public.poker_stable_deal_slices) to authenticated, service_role;

create or replace function public.poker_stable_guest_backer_claim_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_stable_guest_backer_claim_tokens;
  sl public.poker_stable_deal_slices;
  d public.poker_stable_deals;
  player_label text;
  inviter_label text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_stable_guest_backer_claim_tokens
  where token_hash = th;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into sl from public.poker_stable_deal_slices where id = tok.slice_id;
  if not found then
    raise exception 'slice not found';
  end if;

  select * into d from public.poker_stable_deals where id = sl.deal_id;
  if not found or d.status in ('cancelled', 'declined') then
    raise exception 'stake not found';
  end if;
  if not (
    public.poker_stable_deal_is_player_initiated(d.id)
    or public.poker_stable_is_syndicate_guest_backer_slice(d, sl)
  ) then
    raise exception 'claim link is for guest backers only';
  end if;
  if sl.counterparty_kind <> 'guest'
    and not (sl.counterparty_kind = 'user' and sl.staker_user_id is not null) then
    raise exception 'claim link is for guest backers only';
  end if;

  select coalesce(
    nullif(trim(p.display_name), ''),
    case when p.handle is not null and trim(p.handle) <> '' then '@' || trim(both '@' from p.handle) end,
    nullif(trim(d.stakee_guest_label), ''),
    'Player'
  )
  into player_label
  from public.profiles p
  where p.user_id = d.stakee_user_id;

  if player_label is null then
    player_label := coalesce(nullif(trim(d.stakee_guest_label), ''), 'Player');
  end if;

  select coalesce(
    nullif(trim(public.poker_stable_profile_display_name(d.staker_user_id)), ''),
    'Backer'
  )
  into inviter_label
  where d.staker_user_id is not null;

  return jsonb_build_object(
    'deal_id', d.id,
    'slice_id', sl.id,
    'deal_status', d.status,
    'deal_label', d.label,
    'deal_type', d.deal_type,
    'venue_kind', d.venue_kind,
    'notes', d.notes,
    'baseline_bankroll', d.baseline_bankroll,
    'action_pct', sl.action_pct,
    'pricing_mode', sl.pricing_mode,
    'player_profit_pct', sl.player_profit_pct,
    'markup_rate', sl.markup_rate,
    'rakeback_mode', sl.rakeback_mode,
    'rakeback_player_pct', sl.rakeback_player_pct,
    'guest_label', sl.guest_label,
    'guest_email', tok.guest_email,
    'player_label', player_label,
    'inviter_label', inviter_label,
    'syndicate_invite', public.poker_stable_is_syndicate_guest_backer_slice(d, sl),
    'already_linked', sl.counterparty_kind = 'user' and sl.staker_user_id is not null,
    'claimed', tok.claimed_at is not null,
    'expires_at', tok.expires_at
  );
end;
$$;

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
    return jsonb_build_object('ok', true, 'deal_ids', linked_ids, 'redirect', null);
  end if;

  for sl in
    select s.id as slice_id, s.deal_id
    from public.poker_stable_deal_slices s
    join public.poker_stable_deals d on d.id = s.deal_id
    where s.counterparty_kind = 'guest'
      and lower(trim(coalesce(s.guest_email, ''))) = auth_email
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

create or replace function public.poker_stable_slice_invite_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakee uuid;
  v_lead_staker uuid;
  v_label text;
  v_actor uuid;
  v_player_label text;
  v_detail text;
begin
  if new.counterparty_kind is distinct from 'user' then
    return new;
  end if;
  if new.staker_user_id is null then
    return new;
  end if;
  if new.status not in ('pending', 'proposed') then
    return new;
  end if;

  select d.stakee_user_id, d.staker_user_id, d.label
  into v_stakee, v_lead_staker, v_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  if v_lead_staker is not null then
    if new.staker_user_id = v_lead_staker then
      return new;
    end if;
    v_player_label := coalesce(
      nullif(trim(public.poker_stable_profile_display_name(v_stakee)), ''),
      nullif(trim((select stakee_guest_label from public.poker_stable_deals where id = new.deal_id)), ''),
      'the player'
    );
    v_actor := v_lead_staker;
    v_detail := v_player_label || ' on ' || coalesce(v_label, 'Backing stake');
  else
    if v_stakee is null then
      return new;
    end if;
    v_actor := v_stakee;
    v_detail := coalesce(v_label, 'Backing invite');
  end if;

  perform public.poker_stable_emit_activity_event(
    new.staker_user_id,
    v_actor,
    'poker_stable_slice_invite',
    new.deal_id,
    null,
    v_detail
  );

  return new;
end;
$$;

commit;
