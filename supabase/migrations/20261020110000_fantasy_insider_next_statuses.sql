-- One insider post can set several players' next-game status (inactives lists, injury rundowns). `next_statuses` keeps
-- every one ([{ sleeper_id, status, injury, trusted }]); next_status / status_sleeper_id keep the most severe so older
-- readers keep working.
alter table public.fantasy_insider_news add column if not exists next_statuses jsonb not null default '[]'::jsonb;
