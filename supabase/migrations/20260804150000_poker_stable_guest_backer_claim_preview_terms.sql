-- Guest backer claim preview: include deal + slice terms fields for claim landing UI.

create or replace function public.poker_stable_guest_backer_claim_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_stable_guest_backer_claim_tokens;
  sl public.poker_stable_deal_slices;
  d public.poker_stable_deals;
  player_label text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_stable_guest_backer_claim_tokens
  where token_hash = th;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into sl from public.poker_stable_deal_slices where id = tok.slice_id;
  if not found then
    raise exception 'slice not found';
  end if;

  select * into d from public.poker_stable_deals where id = sl.deal_id;
  if not found or d.status in ('cancelled', 'declined') then
    raise exception 'stake not found';
  end if;
  if not public.poker_stable_deal_is_player_initiated(d.id) then
    raise exception 'claim link is for player-initiated stakes only';
  end if;
  if sl.counterparty_kind <> 'guest'
    and not (sl.counterparty_kind = 'user' and sl.staker_user_id is not null) then
    raise exception 'claim link is for guest backers only';
  end if;

  select coalesce(
    nullif(trim(p.display_name), ''),
    case when p.handle is not null and trim(p.handle) <> '' then '@' || trim(both '@' from p.handle) end,
    'Player'
  )
  into player_label
  from public.profiles p
  where p.user_id = d.stakee_user_id;

  return jsonb_build_object(
    'deal_id', d.id,
    'slice_id', sl.id,
    'deal_status', d.status,
    'deal_label', d.label,
    'deal_type', d.deal_type,
    'venue_kind', d.venue_kind,
    'notes', d.notes,
    'baseline_bankroll', d.baseline_bankroll,
    'action_pct', sl.action_pct,
    'pricing_mode', sl.pricing_mode,
    'player_profit_pct', sl.player_profit_pct,
    'markup_rate', sl.markup_rate,
    'rakeback_mode', sl.rakeback_mode,
    'rakeback_player_pct', sl.rakeback_player_pct,
    'guest_label', sl.guest_label,
    'guest_email', tok.guest_email,
    'player_label', coalesce(player_label, 'Player'),
    'already_linked', sl.counterparty_kind = 'user' and sl.staker_user_id is not null,
    'claimed', tok.claimed_at is not null,
    'expires_at', tok.expires_at
  );
end;
$$;
