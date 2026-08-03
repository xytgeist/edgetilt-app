-- Claim link must clear stakee_guest_label when binding stakee_user_id
-- (poker_stable_deals_stakee_target_check: XOR guest label vs Edge user id).

begin;

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
      stakee_guest_label = null,
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

commit;
