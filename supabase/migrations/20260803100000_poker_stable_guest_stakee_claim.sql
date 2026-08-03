-- Guest stakee claim: backer Create Stake → guest player links Edge account via email token,
-- then accepts / declines / counter-proposes terms on Bankroll.

alter table public.poker_stable_deals
  add column if not exists staker_terms_ack_required boolean not null default false;

comment on column public.poker_stable_deals.staker_terms_ack_required is
  'True when stakee counter-proposed terms; lead backer must accept before stake activates.';

create table if not exists public.poker_stable_guest_stakee_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.poker_stable_deals(id) on delete cascade,
  token_hash text not null unique,
  guest_email text,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists poker_stable_guest_stakee_claim_tokens_deal_idx
  on public.poker_stable_guest_stakee_claim_tokens(deal_id);

alter table public.poker_stable_guest_stakee_claim_tokens enable row level security;
revoke all on public.poker_stable_guest_stakee_claim_tokens from authenticated, anon;
grant all on public.poker_stable_guest_stakee_claim_tokens to service_role;

-- ── Helpers ───────────────────────────────────────────────────────────────────

create or replace function public.poker_stable_deal_is_backer_initiated(p_deal_id uuid)
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
      and d.staker_user_id is not null
  );
$$;

revoke all on function public.poker_stable_deal_is_backer_initiated(uuid) from public;
grant execute on function public.poker_stable_deal_is_backer_initiated(uuid) to authenticated, service_role;

create or replace function public.poker_stable_guest_stakee_claim_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_stable_guest_stakee_claim_tokens;
  d public.poker_stable_deals;
  backer_label text;
  action_sold numeric;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_stable_guest_stakee_claim_tokens
  where token_hash = th;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into d from public.poker_stable_deals where id = tok.deal_id;
  if not found or d.status in ('cancelled', 'declined') then
    raise exception 'stake not found';
  end if;
  if not public.poker_stable_deal_is_backer_initiated(d.id) then
    raise exception 'claim link is for backer-initiated stakes only';
  end if;

  select coalesce(
    nullif(trim(p.display_name), ''),
    case when p.handle is not null and trim(p.handle) <> '' then '@' || trim(both '@' from p.handle) end,
    'Backer'
  )
  into backer_label
  from public.profiles p
  where p.user_id = d.staker_user_id;

  select coalesce(sum(s.action_pct), 0)
  into action_sold
  from public.poker_stable_deal_slices s
  where s.deal_id = d.id
    and s.status not in ('declined', 'cancelled');

  return jsonb_build_object(
    'deal_id', d.id,
    'deal_status', d.status,
    'deal_label', d.label,
    'baseline_bankroll', d.baseline_bankroll,
    'venue_kind', d.venue_kind,
    'deal_type', d.deal_type,
    'guest_label', d.stakee_guest_label,
    'guest_email', tok.guest_email,
    'backer_label', coalesce(backer_label, 'Backer'),
    'action_sold_pct', action_sold,
    'already_linked', d.stakee_user_id is not null,
    'claimed', tok.claimed_at is not null,
    'expires_at', tok.expires_at
  );
end;
$$;

revoke all on function public.poker_stable_guest_stakee_claim_preview(text) from public;
grant execute on function public.poker_stable_guest_stakee_claim_preview(text) to anon, authenticated, service_role;

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

-- Stakee accepts backer-initiated offer (deal stays pending until this).
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

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'active');
end;
$$;

revoke all on function public.poker_stable_stakee_accept_backer_offer(uuid) from public;
grant execute on function public.poker_stable_stakee_accept_backer_offer(uuid) to authenticated;

-- Stakee declines → kills deal for everyone.
create or replace function public.poker_stable_stakee_decline_backer_offer(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

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

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'declined');
end;
$$;

revoke all on function public.poker_stable_stakee_decline_backer_offer(uuid) from public;
grant execute on function public.poker_stable_stakee_decline_backer_offer(uuid) to authenticated;

-- Stakee counter-proposes terms → lead backer must accept.
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
    and d.staker_user_id is not null;

  if not found then
    raise exception 'You cannot propose terms on this stake';
  end if;
end;
$$;

revoke all on function public.poker_stable_stakee_propose_counter_terms(uuid, jsonb) from public;
grant execute on function public.poker_stable_stakee_propose_counter_terms(uuid, jsonb) to authenticated;

-- Lead backer accepts stakee counter-proposal (applies deal fields; stake stays pending for stakee accept).
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

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id);
end;
$$;

revoke all on function public.poker_stable_staker_accept_counter_terms(uuid) from public;
grant execute on function public.poker_stable_staker_accept_counter_terms(uuid) to authenticated;

create or replace function public.poker_stable_staker_decline_counter_terms(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

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

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'declined');
end;
$$;

revoke all on function public.poker_stable_staker_decline_counter_terms(uuid) from public;
grant execute on function public.poker_stable_staker_decline_counter_terms(uuid) to authenticated;
