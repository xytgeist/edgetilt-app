-- Revert Gmail-dot alias matching. Gmail dots are how we test two Auth
-- users on one inbox. Keep cancelled-invite copy from 20260917120000.

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

drop function if exists public.et_normalize_invite_email(text);

comment on function public.poker_tournament_swap_claim_link(text) is
  'Authenticated guest invite link: convert tournament swap counterparty to Edge user. Invite email must match the signed-in address exactly.';
comment on function public.poker_tournament_swap_claim_by_email() is
  'Link guest tournament swaps whose invitation email matches the signed-in account exactly.';
