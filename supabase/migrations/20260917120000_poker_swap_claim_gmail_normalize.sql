-- Guest swap claim: Gmail dots / plus-tags are the same mailbox, and a cancelled
-- invite must not read as "swap not found". Apply on TEST first.

create or replace function public.et_normalize_invite_email(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_email, '')));
  local_part text;
  domain text;
begin
  if v = '' or position('@' in v) = 0 then
    return null;
  end if;
  local_part := split_part(v, '@', 1);
  domain := split_part(v, '@', 2);
  if domain in ('gmail.com', 'googlemail.com') then
    local_part := regexp_replace(local_part, '\+.*$', '');
    local_part := replace(local_part, '.', '');
    return local_part || '@gmail.com';
  end if;
  return v;
end;
$$;

revoke all on function public.et_normalize_invite_email(text) from public;
grant execute on function public.et_normalize_invite_email(text) to authenticated, service_role;

comment on function public.et_normalize_invite_email(text) is
  'Lowercase email. Gmail/googlemail: drop dots and plus-tags in the local part.';

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
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    raise exception 'This swap was cancelled';
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
       and public.et_normalize_invite_email(invite_email)
         is distinct from public.et_normalize_invite_email(auth_email) then
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
  auth_norm text;
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

  auth_norm := public.et_normalize_invite_email(auth_email);
  if auth_norm is null then
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
          public.et_normalize_invite_email(s.counterparty_guest_email) is not distinct from auth_norm
          or public.et_normalize_invite_email(t.guest_email) is not distinct from auth_norm
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

comment on function public.poker_tournament_swap_claim_link(text) is
  'Authenticated guest invite link: convert tournament swap counterparty to Edge user. Gmail dots match.';
comment on function public.poker_tournament_swap_claim_by_email() is
  'Link guest tournament swaps whose invitation email matches the signed-in account, including Gmail dot-aliases.';
