-- Guest backer email autolink: match invitation email on slice OR active claim token (cross-browser confirm).

begin;

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

commit;
