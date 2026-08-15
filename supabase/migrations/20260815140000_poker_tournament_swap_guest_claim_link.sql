-- Guest tournament swap claim: convert guest counterparty → Edge user (account-first),
-- mirroring Poker Stable guest stakee claim_link / claim_by_email.
-- Apply on TEST first. Do not apply to production without Ryan's explicit ask.

begin;

alter table public.poker_tournament_swap_claim_tokens
  add column if not exists guest_email text;

comment on column public.poker_tournament_swap_claim_tokens.guest_email is
  'Invitation email captured at token mint; used to gate claim_link / claim_by_email.';

update public.poker_tournament_swap_claim_tokens t
set guest_email = lower(trim(s.counterparty_guest_email))
from public.poker_tournament_swaps s
where t.swap_id = s.id
  and t.guest_email is null
  and t.claimed_at is null
  and nullif(trim(s.counterparty_guest_email), '') is not null;

-- ── Preview (public) ──────────────────────────────────────────────────────────

create or replace function public.poker_tournament_swap_claim_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_tournament_swap_claim_tokens;
  s public.poker_tournament_swaps;
  creator_label text;
  event_label text;
  invite_email text;
  already_linked boolean;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_tournament_swap_claim_tokens
  where token_hash = th;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into s from public.poker_tournament_swaps where id = tok.swap_id;
  if not found or s.status = 'cancelled' then
    raise exception 'swap not found';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.handle), ''), 'Player')
    into creator_label
  from public.profiles p
  where p.user_id = s.creator_user_id;

  select coalesce(nullif(trim(e.display_name), ''), e.venue_name)
    into event_label
  from public.poker_tournament_events e
  where e.id = s.tournament_event_id;

  invite_email := coalesce(
    nullif(lower(trim(tok.guest_email)), ''),
    nullif(lower(trim(s.counterparty_guest_email)), '')
  );
  already_linked := s.counterparty_kind = 'user' and s.counterparty_user_id is not null;

  return jsonb_build_object(
    'swap_id', s.id,
    'status', s.status,
    'creator_label', coalesce(creator_label, 'Player'),
    'guest_label', s.counterparty_guest_label,
    'guest_email', invite_email,
    'pct_creator_gives', s.pct_creator_gives,
    'pct_counterparty_gives', s.pct_counterparty_gives,
    'both_must_cash', s.both_must_cash,
    'final_bullet_only', s.final_bullet_only,
    'final_table_only', s.final_table_only,
    'min_cash_threshold', s.min_cash_threshold,
    'event_label', event_label,
    'creator_result_ready', s.creator_result_ready,
    'creator_buy_in', s.creator_buy_in,
    'creator_prize', s.creator_prize,
    'counterparty_result_ready', s.counterparty_result_ready,
    'counterparty_buy_in', s.counterparty_buy_in,
    'counterparty_prize', s.counterparty_prize,
    'settlement_amount', s.settlement_amount,
    'counterparty_marked_paid', s.counterparty_marked_paid,
    'already_linked', already_linked,
    'claimed', tok.claimed_at is not null,
    'linked_user_is_viewer',
      case
        when auth.uid() is not null and s.counterparty_user_id = auth.uid() then true
        else false
      end,
    'expires_at', tok.expires_at
  );
end;
$$;

revoke all on function public.poker_tournament_swap_claim_preview(text) from public;
grant execute on function public.poker_tournament_swap_claim_preview(text) to anon, authenticated, service_role;

-- ── Shared convert helper ─────────────────────────────────────────────────────

create or replace function public.poker_tournament_swap_attach_counterparty_user(
  p_swap_id uuid,
  p_user_id uuid
)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.poker_tournament_swaps;
  v_amt numeric;
  v_was_null boolean;
begin
  select * into s
  from public.poker_tournament_swaps
  where id = p_swap_id
  for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    raise exception 'Swap is cancelled';
  end if;
  if s.status not in ('active', 'settled') then
    raise exception 'Swap is not available to claim';
  end if;
  if p_user_id is null then
    raise exception 'Sign in to claim this swap';
  end if;
  if s.creator_user_id = p_user_id then
    raise exception 'You cannot claim your own swap';
  end if;
  if s.counterparty_kind = 'user'
     and s.counterparty_user_id is not null
     and s.counterparty_user_id <> p_user_id then
    raise exception 'This swap is already linked to another Edge account';
  end if;

  v_was_null := s.counterparty_user_id is null;

  if s.counterparty_user_id is null or s.counterparty_kind = 'guest' then
    update public.poker_tournament_swaps
    set
      counterparty_kind = 'user',
      counterparty_user_id = p_user_id,
      counterparty_guest_email = null,
      counterparty_guest_phone = null,
      -- Keep guest_label as invite display fallback; Incoming uses profiles when present.
      counterparty_session_id = null,
      counterparty_session_accepted_at = null,
      updated_at = now()
    where id = s.id
    returning * into s;
  end if;

  -- Legacy: Mark settled while still guest credited creator only; catch up counterparty once.
  if v_was_null
     and coalesce(s.settlement_bankroll_posted, false)
     and abs(coalesce(s.settlement_amount, 0)) >= 0.005 then
    v_amt := public.poker_stable_round_money(coalesce(s.settlement_amount, 0));
    perform public.poker_stable_credit_player_personal_bankroll(p_user_id, -v_amt);
  end if;

  update public.poker_tournament_swap_claim_tokens
  set
    claimed_at = coalesce(claimed_at, now()),
    claimed_by_user_id = p_user_id
  where swap_id = s.id
    and claimed_at is null;

  return s;
end;
$$;

revoke all on function public.poker_tournament_swap_attach_counterparty_user(uuid, uuid) from public;
grant execute on function public.poker_tournament_swap_attach_counterparty_user(uuid, uuid) to service_role;

-- ── Authenticated token link ──────────────────────────────────────────────────

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
  if not found or s.status = 'cancelled' then
    raise exception 'swap not found';
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

-- ── Authenticated by-email recovery (no stashed token) ────────────────────────

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

-- Retire anonymous guest result submit (account-required claim path).
revoke all on function public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean, integer)
  to service_role;

comment on function public.poker_tournament_swap_claim_link(text) is
  'Authenticated guest invite link: convert tournament swap counterparty to Edge user.';
comment on function public.poker_tournament_swap_claim_by_email() is
  'Link guest tournament swaps whose invitation email matches the signed-in account.';

commit;
