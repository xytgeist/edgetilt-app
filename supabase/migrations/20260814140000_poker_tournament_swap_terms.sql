-- Optional tournament swap terms: both must cash, final bullet only, final table only.
-- Apply on TEST first. Do not apply to production without Ryan's explicit ask.

alter table public.poker_tournament_swaps
  add column if not exists both_must_cash boolean not null default false,
  add column if not exists final_bullet_only boolean not null default false,
  add column if not exists final_table_only boolean not null default false,
  add column if not exists creator_cashed boolean,
  add column if not exists counterparty_cashed boolean,
  add column if not exists creator_finish_place integer,
  add column if not exists counterparty_finish_place integer,
  add column if not exists creator_table_size text,
  add column if not exists counterparty_table_size text,
  add column if not exists creator_face_buy_in numeric(12, 2),
  add column if not exists counterparty_face_buy_in numeric(12, 2);

comment on column public.poker_tournament_swaps.both_must_cash is
  'Void unless both sides cashed (main prize / cash_out > 0).';
comment on column public.poker_tournament_swaps.final_bullet_only is
  'Profit uses one face buy-in each; extra bullets are not swapped at face.';
comment on column public.poker_tournament_swaps.final_table_only is
  'Void unless either finish is a final table (9, or 6 if 6-max).';

create or replace function public.poker_tournament_swap_try_settle(p_swap_id uuid)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.poker_tournament_swaps;
  v_event_buy numeric;
  v_creator_buy numeric;
  v_cp_buy numeric;
  v_creator_cashed boolean;
  v_cp_cashed boolean;
  v_creator_ft boolean;
  v_cp_ft boolean;
  v_ft_size_c integer;
  v_ft_size_p integer;
  creator_net numeric;
  counterparty_net numeric;
  creator_owes numeric;
  counterparty_owes numeric;
  amount numeric;
begin
  select * into s from public.poker_tournament_swaps where id = p_swap_id for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    return s;
  end if;
  if not s.creator_result_ready or not s.counterparty_result_ready then
    return s;
  end if;

  v_creator_cashed := coalesce(s.creator_cashed, coalesce(s.creator_prize, 0) > 0);
  v_cp_cashed := coalesce(s.counterparty_cashed, coalesce(s.counterparty_prize, 0) > 0);

  if s.both_must_cash and (not v_creator_cashed or not v_cp_cashed) then
    update public.poker_tournament_swaps
    set
      status = 'settled',
      settlement_amount = 0,
      settled_at = coalesce(settled_at, now()),
      updated_at = now()
    where id = p_swap_id
    returning * into s;
    return s;
  end if;

  if s.final_table_only then
    v_ft_size_c := case when s.creator_table_size = '6max' then 6 else 9 end;
    v_ft_size_p := case when s.counterparty_table_size = '6max' then 6 else 9 end;
    v_creator_ft := s.creator_finish_place is not null
      and s.creator_finish_place >= 1
      and s.creator_finish_place <= v_ft_size_c;
    v_cp_ft := s.counterparty_finish_place is not null
      and s.counterparty_finish_place >= 1
      and s.counterparty_finish_place <= v_ft_size_p;
    if not v_creator_ft and not v_cp_ft then
      if s.creator_finish_place is null or s.counterparty_finish_place is null then
        return s;
      end if;
      update public.poker_tournament_swaps
      set
        status = 'settled',
        settlement_amount = 0,
        settled_at = coalesce(settled_at, now()),
        updated_at = now()
      where id = p_swap_id
      returning * into s;
      return s;
    end if;
  end if;

  select e.buy_in into v_event_buy
  from public.poker_tournament_events e
  where e.id = s.tournament_event_id;

  if s.final_bullet_only then
    v_creator_buy := coalesce(s.creator_face_buy_in, v_event_buy, s.creator_buy_in, 0);
    v_cp_buy := coalesce(s.counterparty_face_buy_in, v_event_buy, s.counterparty_buy_in, 0);
  else
    v_creator_buy := coalesce(s.creator_buy_in, 0);
    v_cp_buy := coalesce(s.counterparty_buy_in, 0);
  end if;

  creator_net := coalesce(s.creator_prize, 0) - v_creator_buy;
  counterparty_net := coalesce(s.counterparty_prize, 0) - v_cp_buy;
  creator_owes := greatest(0, creator_net) * (s.pct_creator_gives / 100.0);
  counterparty_owes := greatest(0, counterparty_net) * (s.pct_counterparty_gives / 100.0);
  amount := round((counterparty_owes - creator_owes)::numeric, 2);

  update public.poker_tournament_swaps
  set
    status = 'settled',
    settlement_amount = amount,
    settled_at = coalesce(settled_at, now()),
    updated_at = now()
  where id = p_swap_id
  returning * into s;

  return s;
end;
$$;

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
  if not found or s.status = 'cancelled' then
    raise exception 'swap not found';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.handle), ''), 'Player')
    into creator_label
  from public.profiles p
  where p.user_id = s.creator_user_id;

  select coalesce(nullif(trim(e.display_name), ''), e.venue_name)
    into event_label
  from public.poker_tournament_events e
  where e.id = s.tournament_event_id;

  return jsonb_build_object(
    'swap_id', s.id,
    'status', s.status,
    'creator_label', coalesce(creator_label, 'Player'),
    'guest_label', s.counterparty_guest_label,
    'pct_creator_gives', s.pct_creator_gives,
    'pct_counterparty_gives', s.pct_counterparty_gives,
    'both_must_cash', s.both_must_cash,
    'final_bullet_only', s.final_bullet_only,
    'final_table_only', s.final_table_only,
    'event_label', event_label,
    'creator_result_ready', s.creator_result_ready,
    'creator_buy_in', s.creator_buy_in,
    'creator_prize', s.creator_prize,
    'counterparty_result_ready', s.counterparty_result_ready,
    'counterparty_buy_in', s.counterparty_buy_in,
    'counterparty_prize', s.counterparty_prize,
    'settlement_amount', s.settlement_amount,
    'counterparty_marked_paid', s.counterparty_marked_paid,
    'expires_at', tok.expires_at
  );
end;
$$;

drop function if exists public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean);

create function public.poker_tournament_swap_claim_submit(
  p_token text,
  p_buy_in numeric,
  p_prize numeric,
  p_mark_paid boolean default false,
  p_finish_place integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_tournament_swap_claim_tokens;
  s public.poker_tournament_swaps;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  if p_buy_in is null or p_buy_in < 0 then
    raise exception 'buy-in must be >= 0';
  end if;
  if p_prize is null or p_prize < 0 then
    raise exception 'prize must be >= 0';
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
  if not found or s.status = 'cancelled' then
    raise exception 'swap not found';
  end if;
  if s.counterparty_kind <> 'guest' then
    raise exception 'claim link is for guest swaps only';
  end if;

  update public.poker_tournament_swaps
  set
    counterparty_buy_in = p_buy_in,
    counterparty_prize = p_prize,
    counterparty_cashed = p_prize > 0,
    counterparty_finish_place = p_finish_place,
    counterparty_result_source = 'manual',
    counterparty_result_ready = true,
    counterparty_marked_paid = case
      when coalesce(p_mark_paid, false) then true
      else counterparty_marked_paid
    end,
    updated_at = now()
  where id = s.id;

  update public.poker_tournament_swap_claim_tokens
  set
    claimed_at = coalesce(claimed_at, now()),
    claimed_by_user_id = auth.uid()
  where id = tok.id;

  s := public.poker_tournament_swap_try_settle(s.id);

  return jsonb_build_object(
    'ok', true,
    'status', s.status,
    'settlement_amount', s.settlement_amount,
    'counterparty_marked_paid', s.counterparty_marked_paid
  );
end;
$$;

revoke all on function public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean, integer) from public;
grant execute on function public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean, integer)
  to anon, authenticated, service_role;
