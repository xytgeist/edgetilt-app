-- Phase 1: deal lifecycle activity events (create/accept/decline/counter) + guest backer claim tokens.

-- ---------------------------------------------------------------------------
-- activity_events: new poker stable lifecycle types
-- ---------------------------------------------------------------------------

alter table public.activity_events drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid',
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite',
      'chat_call_missed',
      'chat_mention',
      'starter_weekly_guide_drop',
      'creator_fan_sub',
      'poker_tournament_swap',
      'poker_tournament_swap_result',
      'ap_guide_released',
      'poker_stable_slice_invite',
      'poker_stable_session_complete',
      'poker_stable_settled',
      'poker_stable_payment_claim',
      'poker_stable_payment_claim_resolved',
      'poker_stable_settlement_proposed',
      'poker_stable_settlement_resolved',
      'poker_stable_commit_recorded',
      'poker_stable_backer_offer',
      'poker_stable_stakee_accepted',
      'poker_stable_stakee_declined',
      'poker_stable_stakee_counter_proposed',
      'poker_stable_staker_counter_accepted',
      'poker_stable_staker_counter_declined',
      'poker_stable_slice_accepted',
      'poker_stable_slice_declined'
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_deal_is_player_initiated(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.poker_stable_deals d
    where d.id = p_deal_id
      and d.staker_user_id is null
  );
$$;

revoke all on function public.poker_stable_deal_is_player_initiated(uuid) from public;
grant execute on function public.poker_stable_deal_is_player_initiated(uuid) to authenticated, service_role;

create or replace function public.poker_stable_notify_lead_and_syndicate_backers(
  p_deal_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_detail text default null,
  p_lead_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.poker_stable_deals%rowtype;
  r record;
begin
  select * into d from public.poker_stable_deals where id = p_deal_id;
  if not found then
    return;
  end if;

  if d.staker_user_id is not null
    and d.staker_user_id is distinct from p_actor_user_id then
    perform public.poker_stable_emit_activity_event(
      d.staker_user_id,
      p_actor_user_id,
      p_event_type,
      p_deal_id,
      null,
      p_detail
    );
  end if;

  if p_lead_only then
    return;
  end if;

  for r in
    select distinct s.staker_user_id as uid
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and s.status in ('pending', 'active')
      and s.staker_user_id is distinct from p_actor_user_id
      and s.staker_user_id is distinct from d.staker_user_id
  loop
    perform public.poker_stable_emit_activity_event(
      r.uid,
      p_actor_user_id,
      p_event_type,
      p_deal_id,
      null,
      p_detail
    );
  end loop;
end;
$$;

revoke all on function public.poker_stable_notify_lead_and_syndicate_backers(uuid, uuid, text, text, boolean) from public;
grant execute on function public.poker_stable_notify_lead_and_syndicate_backers(uuid, uuid, text, text, boolean) to service_role;

create or replace function public.poker_stable_notify_stakee(
  p_deal_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakee uuid;
begin
  select d.stakee_user_id into v_stakee
  from public.poker_stable_deals d
  where d.id = p_deal_id;

  if v_stakee is null or v_stakee = p_actor_user_id then
    return;
  end if;

  perform public.poker_stable_emit_activity_event(
    v_stakee,
    p_actor_user_id,
    p_event_type,
    p_deal_id,
    null,
    p_detail
  );
end;
$$;

revoke all on function public.poker_stable_notify_stakee(uuid, uuid, text, text) from public;
grant execute on function public.poker_stable_notify_stakee(uuid, uuid, text, text) to service_role;

-- Backer Create Stake → Edge player (deal insert with both parties linked).
create or replace function public.poker_stable_backer_offer_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staker_user_id is null or new.stakee_user_id is null then
    return new;
  end if;
  if new.status not in ('pending', 'active') then
    return new;
  end if;

  perform public.poker_stable_emit_activity_event(
    new.stakee_user_id,
    new.staker_user_id,
    'poker_stable_backer_offer',
    new.id,
    null,
    coalesce(new.label, 'Backing offer')
  );

  return new;
end;
$$;

drop trigger if exists poker_stable_backer_offer_activity on public.poker_stable_deals;
create trigger poker_stable_backer_offer_activity
  after insert on public.poker_stable_deals
  for each row
  execute function public.poker_stable_backer_offer_activity();

-- Player Create Stake → Edge backer accepts/declines slice.
create or replace function public.poker_stable_slice_response_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakee uuid;
  v_deal_staker uuid;
  v_label text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if old.status is not distinct from new.status then
    return new;
  end if;
  if old.status <> 'pending' then
    return new;
  end if;
  if new.status not in ('active', 'declined') then
    return new;
  end if;
  if new.counterparty_kind <> 'user' or new.staker_user_id is null then
    return new;
  end if;

  select d.stakee_user_id, d.staker_user_id, d.label
  into v_stakee, v_deal_staker, v_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  if v_stakee is null or v_deal_staker is not null then
    return new;
  end if;

  if new.status = 'active' then
    perform public.poker_stable_emit_activity_event(
      v_stakee,
      new.staker_user_id,
      'poker_stable_slice_accepted',
      new.deal_id,
      null,
      coalesce(v_label, 'Backing stake')
    );
  elsif new.status = 'declined' then
    perform public.poker_stable_emit_activity_event(
      v_stakee,
      new.staker_user_id,
      'poker_stable_slice_declined',
      new.deal_id,
      null,
      coalesce(v_label, 'Backing stake')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists poker_stable_slice_response_activity on public.poker_stable_deal_slices;
create trigger poker_stable_slice_response_activity
  after update of status on public.poker_stable_deal_slices
  for each row
  execute function public.poker_stable_slice_response_activity();

-- ---------------------------------------------------------------------------
-- Guest backer claim (player Create Stake → guest backer links Edge account)
-- ---------------------------------------------------------------------------

create table if not exists public.poker_stable_guest_backer_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  slice_id uuid not null references public.poker_stable_deal_slices(id) on delete cascade,
  token_hash text not null unique,
  guest_email text,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists poker_stable_guest_backer_claim_tokens_slice_idx
  on public.poker_stable_guest_backer_claim_tokens(slice_id);

alter table public.poker_stable_guest_backer_claim_tokens enable row level security;
revoke all on public.poker_stable_guest_backer_claim_tokens from authenticated, anon;
grant all on public.poker_stable_guest_backer_claim_tokens to service_role;

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
  if not public.poker_stable_deal_is_player_initiated(d.id) then
    raise exception 'claim link is for player-initiated stakes only';
  end if;
  if sl.counterparty_kind <> 'guest'
    and not (sl.counterparty_kind = 'user' and sl.staker_user_id is not null) then
    raise exception 'claim link is for guest backers only';
  end if;

  select coalesce(
    nullif(trim(p.display_name), ''),
    case when p.handle is not null and trim(p.handle) <> '' then '@' || trim(both '@' from p.handle) end,
    'Player'
  )
  into player_label
  from public.profiles p
  where p.user_id = d.stakee_user_id;

  return jsonb_build_object(
    'deal_id', d.id,
    'slice_id', sl.id,
    'deal_status', d.status,
    'deal_label', d.label,
    'baseline_bankroll', d.baseline_bankroll,
    'action_pct', sl.action_pct,
    'pricing_mode', sl.pricing_mode,
    'player_profit_pct', sl.player_profit_pct,
    'markup_rate', sl.markup_rate,
    'guest_label', sl.guest_label,
    'guest_email', tok.guest_email,
    'player_label', coalesce(player_label, 'Player'),
    'already_linked', sl.counterparty_kind = 'user' and sl.staker_user_id is not null,
    'claimed', tok.claimed_at is not null,
    'expires_at', tok.expires_at
  );
end;
$$;

revoke all on function public.poker_stable_guest_backer_claim_preview(text) from public;
grant execute on function public.poker_stable_guest_backer_claim_preview(text) to anon, authenticated, service_role;

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
  if not public.poker_stable_deal_is_player_initiated(d.id) then
    raise exception 'claim link is for player-initiated stakes only';
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
      guest_label = null,
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
    'deal_id', d.id,
    'slice_id', sl.id,
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
    return jsonb_build_object('ok', true, 'deal_ids', linked_ids, 'redirect', null);
  end if;

  for sl in
    select s.id as slice_id, s.deal_id
    from public.poker_stable_deal_slices s
    join public.poker_stable_deals d on d.id = s.deal_id
    where s.counterparty_kind = 'guest'
      and lower(trim(coalesce(s.guest_email, ''))) = auth_email
      and d.stakee_user_id is not null
      and d.stakee_user_id <> v_uid
      and d.status in ('pending', 'active', 'draft')
      and public.poker_stable_deal_is_player_initiated(d.id)
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
      guest_label = null,
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

-- ---------------------------------------------------------------------------
-- Lifecycle RPCs: emit activity after state change
-- ---------------------------------------------------------------------------

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

create or replace function public.poker_stable_stakee_accept_backer_offer(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d public.poker_stable_deals;
  roll numeric;
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into d
  from public.poker_stable_deals
  where id = p_deal_id
  for update;

  if not found then
    raise exception 'Deal not found';
  end if;
  if d.stakee_user_id <> v_uid then
    raise exception 'Only the player can accept this stake';
  end if;
  if d.status <> 'pending' then
    raise exception 'Stake is not pending';
  end if;
  if d.staker_user_id is null then
    raise exception 'Not a backer-initiated stake';
  end if;
  if d.staker_terms_ack_required then
    raise exception 'Waiting for the backer to respond to your counter-proposal';
  end if;
  if d.stakee_terms_ack_required then
    raise exception 'Accept the backer''s revised terms first';
  end if;

  roll := coalesce(nullif(d.starting_roll, 0), d.baseline_bankroll, 0);
  v_detail := coalesce(d.label, 'Backing stake');

  update public.poker_stable_deals
  set
    status = 'active',
    responded_at = now(),
    starting_roll = roll
  where id = p_deal_id;

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, roll)
  on conflict (deal_id) do update
  set overall_bankroll = excluded.overall_bankroll;

  perform public.poker_stable_notify_lead_and_syndicate_backers(
    p_deal_id,
    v_uid,
    'poker_stable_stakee_accepted',
    v_detail,
    false
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'active');
end;
$$;

create or replace function public.poker_stable_stakee_decline_backer_offer(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(d.label, 'Backing stake')
  into v_detail
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status = 'pending'
    and d.staker_user_id is not null;

  update public.poker_stable_deals
  set
    status = 'declined',
    responded_at = now(),
    pending_terms_json = null,
    stakee_terms_ack_required = false,
    staker_terms_ack_required = false
  where id = p_deal_id
    and stakee_user_id = v_uid
    and status = 'pending'
    and staker_user_id is not null;

  if not found then
    raise exception 'You cannot decline this stake';
  end if;

  update public.poker_stable_deal_slices
  set status = 'declined', responded_at = now()
  where deal_id = p_deal_id
    and status in ('pending', 'active');

  perform public.poker_stable_notify_lead_and_syndicate_backers(
    p_deal_id,
    v_uid,
    'poker_stable_stakee_declined',
    v_detail,
    false
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'declined');
end;
$$;

create or replace function public.poker_stable_stakee_propose_counter_terms(
  p_deal_id uuid,
  p_terms jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_terms is null or jsonb_typeof(p_terms) <> 'object' then
    raise exception 'Invalid terms payload';
  end if;

  update public.poker_stable_deals d
  set
    pending_terms_json = p_terms,
    staker_terms_ack_required = true,
    stakee_terms_ack_required = false,
    terms_revised_at = now(),
    terms_revised_by = v_uid
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status = 'pending'
    and d.staker_user_id is not null
  returning coalesce(d.label, 'Backing stake') into v_detail;

  if not found then
    raise exception 'You cannot propose terms on this stake';
  end if;

  perform public.poker_stable_notify_lead_and_syndicate_backers(
    p_deal_id,
    v_uid,
    'poker_stable_stakee_counter_proposed',
    v_detail,
    true
  );
end;
$$;

create or replace function public.poker_stable_staker_accept_counter_terms(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d public.poker_stable_deals;
  payload jsonb;
  deal_part jsonb;
  slices_part jsonb;
  v_slice jsonb;
  v_idx integer := 0;
  v_action_total numeric := 0;
  v_kind text;
  v_staker uuid;
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into d
  from public.poker_stable_deals
  where id = p_deal_id
    and staker_user_id = v_uid
    and status = 'pending'
    and staker_terms_ack_required = true
  for update;

  if not found or d.pending_terms_json is null then
    raise exception 'No counter-proposal to accept';
  end if;

  v_detail := coalesce(d.label, 'Backing stake');
  payload := d.pending_terms_json;
  deal_part := coalesce(payload->'deal', '{}'::jsonb);
  slices_part := coalesce(payload->'slices', '[]'::jsonb);

  if jsonb_typeof(slices_part) = 'array' then
    for v_slice in select value from jsonb_array_elements(slices_part)
    loop
      v_action_total := v_action_total + coalesce((v_slice->>'action_pct')::numeric, 0);
    end loop;
    if v_action_total > 100.001 then
      raise exception 'Total action sold cannot exceed 100%%';
    end if;
  end if;

  update public.poker_stable_deals
  set
    label = coalesce(nullif(btrim(deal_part->>'label'), ''), label),
    baseline_bankroll = coalesce((deal_part->>'baseline_bankroll')::numeric, baseline_bankroll),
    starting_roll = coalesce((deal_part->>'starting_roll')::numeric, starting_roll),
    is_migration = coalesce((deal_part->>'is_migration')::boolean, is_migration),
    stake_wide_starting_pl = case
      when deal_part ? 'stake_wide_starting_pl' then (deal_part->>'stake_wide_starting_pl')::numeric
      else stake_wide_starting_pl
    end,
    lifetime_pl_display = case
      when deal_part ? 'lifetime_pl_display' then (deal_part->>'lifetime_pl_display')::numeric
      else lifetime_pl_display
    end,
    pending_terms_json = null,
    staker_terms_ack_required = false,
    stakee_terms_ack_required = false,
    terms_revised_at = null,
    terms_revised_by = null
  where id = p_deal_id;

  if jsonb_typeof(slices_part) = 'array' and jsonb_array_length(slices_part) > 0 then
    delete from public.poker_stable_deal_slices where deal_id = p_deal_id;

    for v_slice in select value from jsonb_array_elements(slices_part)
    loop
      v_kind := coalesce(v_slice->>'counterparty_kind', 'guest');
      v_staker := nullif(v_slice->>'staker_user_id', '')::uuid;

      insert into public.poker_stable_deal_slices (
        deal_id,
        slice_index,
        counterparty_kind,
        staker_user_id,
        guest_label,
        guest_phone,
        guest_email,
        action_pct,
        pricing_mode,
        player_profit_pct,
        markup_rate,
        rakeback_mode,
        rakeback_player_pct,
        status,
        responded_at,
        label
      ) values (
        p_deal_id,
        v_idx,
        v_kind,
        v_staker,
        nullif(btrim(v_slice->>'guest_label'), ''),
        nullif(btrim(v_slice->>'guest_phone'), ''),
        nullif(lower(btrim(v_slice->>'guest_email')), ''),
        (v_slice->>'action_pct')::numeric,
        v_slice->>'pricing_mode',
        case when v_slice->>'pricing_mode' = 'profit_split' then (v_slice->>'player_profit_pct')::numeric else null end,
        case when v_slice->>'pricing_mode' = 'markup' then (v_slice->>'markup_rate')::numeric else null end,
        coalesce(v_slice->>'rakeback_mode', 'disabled'),
        case when coalesce(v_slice->>'rakeback_mode', 'disabled') = 'custom' then (v_slice->>'rakeback_player_pct')::numeric else null end,
        case
          when v_kind = 'guest' then 'active'
          when v_staker = v_uid then 'active'
          else 'pending'
        end,
        case
          when v_kind = 'guest' or v_staker = v_uid then now()
          else null
        end,
        nullif(btrim(v_slice->>'label'), '')
      );
      v_idx := v_idx + 1;
    end loop;
  end if;

  perform public.poker_stable_notify_stakee(
    p_deal_id,
    v_uid,
    'poker_stable_staker_counter_accepted',
    v_detail
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id);
end;
$$;

create or replace function public.poker_stable_staker_decline_counter_terms(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(d.label, 'Backing stake')
  into v_detail
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.staker_user_id = v_uid
    and d.status = 'pending'
    and d.staker_terms_ack_required = true;

  update public.poker_stable_deals
  set
    status = 'declined',
    responded_at = now(),
    pending_terms_json = null,
    stakee_terms_ack_required = false,
    staker_terms_ack_required = false
  where id = p_deal_id
    and staker_user_id = v_uid
    and status = 'pending'
    and staker_terms_ack_required = true;

  if not found then
    raise exception 'You cannot decline this counter-proposal';
  end if;

  update public.poker_stable_deal_slices
  set status = 'declined', responded_at = now()
  where deal_id = p_deal_id
    and status in ('pending', 'active');

  perform public.poker_stable_notify_stakee(
    p_deal_id,
    v_uid,
    'poker_stable_staker_counter_declined',
    v_detail
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'declined');
end;
$$;
