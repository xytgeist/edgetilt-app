-- Fix creator display name on guest swap claim preview (profiles.user_id, not profiles.id).

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

revoke all on function public.poker_tournament_swap_claim_preview(text) from public;
grant execute on function public.poker_tournament_swap_claim_preview(text) to anon, authenticated, service_role;
