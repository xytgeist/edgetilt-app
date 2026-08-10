-- Shared formatter for session-complete Alerts detail + backfill legacy
-- "Deal · table +1,252.00" rows to "Deal · Venue 10/20 · +$1,252".

begin;

create or replace function public.poker_stable_format_blind_part(p_val numeric)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  if p_val is null or p_val <= 0 then
    return null;
  end if;
  if p_val = trunc(p_val) then
    return trim(to_char(p_val, 'FM999999990'));
  end if;
  v := regexp_replace(trim(to_char(p_val, 'FM999999990.99')), '0+$', '');
  v := regexp_replace(v, '\.$', '');
  if v like '0.%' then
    v := substr(v, 2);
  end if;
  return nullif(v, '');
end;
$$;

create or replace function public.poker_stable_format_session_complete_detail(
  p_deal_label text,
  p_session public.poker_bankroll_sessions
)
returns text
language plpgsql
stable
as $$
declare
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
  v_wl := public.poker_stable_round_money(
    coalesce(p_session.cash_out, 0)
    + coalesce(p_session.bounty_winnings, 0)
    - coalesce(p_session.buy_in, 0)
    - coalesce(p_session.rebuy_amount, 0)
    - coalesce(p_session.addon_amount, 0)
  );

  v_venue := nullif(trim(coalesce(p_session.venue_name, '')), '');

  if coalesce(p_session.session_type, 'cash') = 'tournament' then
    v_stakes := nullif(trim(coalesce(p_session.tournament_name, '')), '');
    if v_stakes is null and coalesce(p_session.buy_in, 0) > 0 then
      v_stakes := trim(to_char(round(p_session.buy_in), 'FM$999,999,990')) || ' buy-in';
    end if;
  else
    v_sb := public.poker_stable_format_blind_part(p_session.small_blind);
    v_bb := public.poker_stable_format_blind_part(p_session.big_blind);
    v_third := public.poker_stable_format_blind_part(p_session.third_blind);
    if v_sb is not null and v_bb is not null then
      if v_third is not null then
        v_stakes := v_sb || '/' || v_bb || '/' || v_third;
      else
        v_stakes := v_sb || '/' || v_bb;
      end if;
    else
      v_stakes := nullif(trim(coalesce(p_session.game_variant, '')), '');
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

  v_detail := coalesce(nullif(trim(p_deal_label), ''), 'Stake session');
  if v_mid is not null then
    v_detail := v_detail || ' · ' || v_mid;
  end if;
  v_detail := v_detail || ' · ' || v_pl;
  return v_detail;
end;
$$;

create or replace function public.poker_stable_session_complete_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice record;
  v_deal_label text;
  v_detail text;
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

  v_detail := public.poker_stable_format_session_complete_detail(v_deal_label, new);

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

-- Backfill legacy "· table" session-complete Alerts from the matching completed session.
do $$
declare
  r record;
  v_session public.poker_bankroll_sessions%rowtype;
  v_deal_label text;
  v_detail text;
begin
  for r in
    select e.id, e.poker_stable_deal_id, e.created_at, e.detail_text
    from public.activity_events e
    where e.event_type = 'poker_stable_session_complete'
      and e.poker_stable_deal_id is not null
      and e.detail_text like '% · table %'
  loop
    select s.*
    into v_session
    from public.poker_bankroll_sessions s
    where s.deal_id = r.poker_stable_deal_id
      and s.status = 'completed'
      and coalesce(s.notes, '') not like '%seed:%'
    order by abs(
      extract(epoch from (coalesce(s.end_at, s.created_at) - r.created_at))
    )
    limit 1;

    if v_session.id is null then
      continue;
    end if;

    select d.label into v_deal_label
    from public.poker_stable_deals d
    where d.id = r.poker_stable_deal_id;

    v_detail := public.poker_stable_format_session_complete_detail(v_deal_label, v_session);

    update public.activity_events
    set detail_text = v_detail
    where id = r.id
      and detail_text is distinct from v_detail;
  end loop;
end;
$$;

comment on function public.poker_stable_format_session_complete_detail(text, public.poker_bankroll_sessions) is
  'Alerts detail: Deal · Venue 10/20 · +$1,252 (whole dollars).';

commit;
