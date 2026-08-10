-- Session-complete Alerts detail: "Deal · Wynn 10/20 · +$1,252"
-- (venue + stakes, whole dollars, no "table", include bounty in P/L).

begin;

create or replace function public.poker_stable_session_complete_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice record;
  v_deal_label text;
  v_wl numeric;
  v_wl_abs numeric;
  v_detail text;
  v_mid text;
  v_stakes text;
  v_sb text;
  v_bb text;
  v_third text;
  v_venue text;
  v_pl text;
begin
  if new.deal_id is null or new.status is distinct from 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'completed' then
    return new;
  end if;
  if coalesce(new.notes, '') like '%seed:%' then
    return new;
  end if;

  select d.label into v_deal_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  v_wl := public.poker_stable_round_money(
    coalesce(new.cash_out, 0)
    + coalesce(new.bounty_winnings, 0)
    - coalesce(new.buy_in, 0)
    - coalesce(new.rebuy_amount, 0)
    - coalesce(new.addon_amount, 0)
  );

  v_venue := nullif(trim(coalesce(new.venue_name, '')), '');

  if coalesce(new.session_type, 'cash') = 'tournament' then
    v_stakes := nullif(trim(coalesce(new.tournament_name, '')), '');
    if v_stakes is null and coalesce(new.buy_in, 0) > 0 then
      v_stakes := trim(to_char(round(new.buy_in), 'FM$999,999,990')) || ' buy-in';
    end if;
  else
    -- Integer blinds → 10/20; fractional → 0.50/1 (trim trailing zeros after decimal only).
    if coalesce(new.small_blind, 0) > 0 then
      if new.small_blind = trunc(new.small_blind) then
        v_sb := trim(to_char(new.small_blind, 'FM999999990'));
      else
        v_sb := regexp_replace(trim(to_char(new.small_blind, 'FM999999990.99')), '0+$', '');
        v_sb := regexp_replace(v_sb, '\.$', '');
        if v_sb like '0.%' then
          v_sb := substr(v_sb, 2);
        end if;
      end if;
    end if;
    if coalesce(new.big_blind, 0) > 0 then
      if new.big_blind = trunc(new.big_blind) then
        v_bb := trim(to_char(new.big_blind, 'FM999999990'));
      else
        v_bb := regexp_replace(trim(to_char(new.big_blind, 'FM999999990.99')), '0+$', '');
        v_bb := regexp_replace(v_bb, '\.$', '');
        if v_bb like '0.%' then
          v_bb := substr(v_bb, 2);
        end if;
      end if;
    end if;
    if coalesce(new.third_blind, 0) > 0 then
      if new.third_blind = trunc(new.third_blind) then
        v_third := trim(to_char(new.third_blind, 'FM999999990'));
      else
        v_third := regexp_replace(trim(to_char(new.third_blind, 'FM999999990.99')), '0+$', '');
        v_third := regexp_replace(v_third, '\.$', '');
        if v_third like '0.%' then
          v_third := substr(v_third, 2);
        end if;
      end if;
    end if;
    if v_sb is not null and v_bb is not null then
      if v_third is not null then
        v_stakes := v_sb || '/' || v_bb || '/' || v_third;
      else
        v_stakes := v_sb || '/' || v_bb;
      end if;
    else
      v_stakes := nullif(trim(coalesce(new.game_variant, '')), '');
    end if;
  end if;

  if v_venue is not null and v_stakes is not null then
    v_mid := v_venue || ' ' || v_stakes;
  elsif v_venue is not null then
    v_mid := v_venue;
  else
    v_mid := v_stakes;
  end if;

  v_wl_abs := abs(round(v_wl));
  v_pl :=
    case when v_wl >= 0 then '+' else '-' end
    || trim(to_char(v_wl_abs, 'FM$999,999,990'));

  v_detail := coalesce(nullif(trim(v_deal_label), ''), 'Stake session');
  if v_mid is not null then
    v_detail := v_detail || ' · ' || v_mid;
  end if;
  v_detail := v_detail || ' · ' || v_pl;

  for v_slice in
    select s.staker_user_id
    from public.poker_stable_deal_slices s
    where s.deal_id = new.deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and s.status = 'active'
  loop
    perform public.poker_stable_emit_activity_event(
      v_slice.staker_user_id,
      new.user_id,
      'poker_stable_session_complete',
      new.deal_id,
      null,
      v_detail
    );
  end loop;

  return new;
end;
$$;

comment on function public.poker_stable_session_complete_activity() is
  'Emit poker_stable_session_complete with detail "Deal · Venue 10/20 · +$1,252" for active Edge backers.';

commit;
