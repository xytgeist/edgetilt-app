-- One live desk call per event/market. Ghost re-inserts were doubling CFB CLV/ATS.
-- Cancelled PASS rows stay eligible to be replaced by a later real call.
create unique index if not exists lounge_bot_picks_desk_event_uidx
  on public.lounge_bot_picks (bot_user_id, picker_name, event_id, market_key, pick_name)
  where status is distinct from 'cancelled';
