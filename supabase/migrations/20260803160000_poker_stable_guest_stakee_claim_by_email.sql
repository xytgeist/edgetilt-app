-- Link guest stakee deals when the signed-in user's email matches stakee_guest_email.
-- Covers email-confirm flows that skip /poker-stake-claim (no sessionStorage token).

begin;

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

commit;
