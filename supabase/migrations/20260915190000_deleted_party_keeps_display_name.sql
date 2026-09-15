-- Freeze the human name when a party deletes. Edge Lord should still see
-- "Joey (Deleted User)", not a generic deleted placeholder.
-- Stamp on profile BEFORE DELETE (name is still on the row), and again on
-- SET NULL updates if that fires first.

create or replace function public.et_format_deleted_party_label(p_user_id uuid, p_existing text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base text;
begin
  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.handle), ''))
    into base
  from public.profiles p
  where p.user_id = p_user_id;

  if base is null then
    base := nullif(
      trim(regexp_replace(coalesce(p_existing, ''), '\s*\((Deleted User|Deleted account)\)\s*$', '', 'i')),
      ''
    );
  end if;

  if base is null or lower(base) in ('deleted user', 'deleted account') then
    return 'Deleted User';
  end if;
  return base || ' (Deleted User)';
end;
$$;

create or replace function public.poker_stable_deals_on_party_user_nulled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stakee_user_id is null and old.stakee_user_id is not null then
    new.stakee_guest_label := public.et_format_deleted_party_label(
      old.stakee_user_id,
      new.stakee_guest_label
    );
  end if;
  return new;
end;
$$;

create or replace function public.poker_stable_deal_slices_on_staker_nulled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staker_user_id is null and old.staker_user_id is not null then
    new.counterparty_kind := 'guest';
    new.guest_label := public.et_format_deleted_party_label(
      old.staker_user_id,
      new.guest_label
    );
  end if;
  return new;
end;
$$;

create or replace function public.poker_tournament_swaps_on_counterparty_user_nulled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.counterparty_user_id is null and old.counterparty_user_id is not null then
    new.counterparty_kind := 'guest';
    new.counterparty_guest_label := public.et_format_deleted_party_label(
      old.counterparty_user_id,
      new.counterparty_guest_label
    );
  end if;
  return new;
end;
$$;

create or replace function public.poker_preserve_party_names_before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
begin
  label := public.et_format_deleted_party_label(
    old.user_id,
    coalesce(old.display_name, old.handle)
  );

  update public.poker_stable_deals
  set
    stakee_guest_label = label,
    stakee_user_id = null
  where stakee_user_id = old.user_id;

  update public.poker_stable_deals
  set staker_user_id = null
  where staker_user_id = old.user_id;

  update public.poker_stable_deal_slices
  set
    counterparty_kind = 'guest',
    guest_label = label,
    staker_user_id = null
  where staker_user_id = old.user_id;

  update public.poker_tournament_swaps
  set
    counterparty_kind = 'guest',
    counterparty_guest_label = label,
    counterparty_user_id = null
  where counterparty_user_id = old.user_id;

  return old;
end;
$$;

drop trigger if exists trg_poker_preserve_party_names_before_profile_delete on public.profiles;
create trigger trg_poker_preserve_party_names_before_profile_delete
  before delete on public.profiles
  for each row
  execute function public.poker_preserve_party_names_before_profile_delete();

comment on function public.et_format_deleted_party_label(uuid, text) is
  'Display name or handle plus (Deleted User). Last resort: Deleted User.';
