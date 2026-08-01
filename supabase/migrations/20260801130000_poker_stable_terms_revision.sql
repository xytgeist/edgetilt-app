-- Pending deal term revisions: backer proposes → player accepts before terms apply.

alter table public.poker_stable_deals
  add column if not exists pending_terms_json jsonb,
  add column if not exists stakee_terms_ack_required boolean not null default false,
  add column if not exists terms_revised_at timestamptz,
  add column if not exists terms_revised_by uuid references auth.users(id) on delete set null;

create or replace function public.poker_stable_propose_terms(p_deal_id uuid, p_terms jsonb)
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
  if not exists (
    select 1
    from public.poker_stable_deals d
    join public.poker_stable_deal_slices s on s.deal_id = d.id
    where d.id = p_deal_id
      and d.status = 'pending'
      and s.staker_user_id = v_uid
      and s.status = 'pending'
  ) then
    raise exception 'You cannot propose terms on this deal';
  end if;

  update public.poker_stable_deals
  set
    pending_terms_json = p_terms,
    stakee_terms_ack_required = true,
    terms_revised_at = now(),
    terms_revised_by = v_uid
  where id = p_deal_id
    and status = 'pending';
end;
$$;

create or replace function public.poker_stable_clear_proposed_terms(p_deal_id uuid)
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

  update public.poker_stable_deals d
  set
    pending_terms_json = null,
    stakee_terms_ack_required = false,
    terms_revised_at = null,
    terms_revised_by = null
  where d.id = p_deal_id
    and d.status = 'pending'
    and (
      d.stakee_user_id = v_uid
      or exists (
        select 1
        from public.poker_stable_deal_slices s
        where s.deal_id = d.id
          and s.staker_user_id = v_uid
          and s.status = 'pending'
      )
    );
end;
$$;

revoke all on function public.poker_stable_propose_terms(uuid, jsonb) from public;
grant execute on function public.poker_stable_propose_terms(uuid, jsonb) to authenticated;
revoke all on function public.poker_stable_clear_proposed_terms(uuid) from public;
grant execute on function public.poker_stable_clear_proposed_terms(uuid) to authenticated;
