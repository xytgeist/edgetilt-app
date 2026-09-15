-- slices.label is a real column. The profile-delete trigger used a variable
-- named label, so guest_label = label was 42702 ambiguous.

create or replace function public.poker_preserve_party_names_before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party_label text;
begin
  v_party_label := public.et_format_deleted_party_label(
    old.user_id,
    coalesce(old.display_name, old.handle)
  );

  update public.poker_stable_deals
  set
    stakee_guest_label = v_party_label,
    stakee_user_id = null
  where stakee_user_id = old.user_id;

  update public.poker_stable_deals
  set staker_user_id = null
  where staker_user_id = old.user_id;

  update public.poker_stable_deal_slices
  set
    counterparty_kind = 'guest',
    guest_label = v_party_label,
    staker_user_id = null
  where staker_user_id = old.user_id;

  update public.poker_tournament_swaps
  set
    counterparty_kind = 'guest',
    counterparty_guest_label = v_party_label,
    counterparty_user_id = null
  where counterparty_user_id = old.user_id;

  return old;
end;
$$;
