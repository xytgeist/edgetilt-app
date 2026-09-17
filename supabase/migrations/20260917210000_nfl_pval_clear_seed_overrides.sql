-- Start Sleeper-owned. Seed / first-fill had stamped is_custom_override.
-- Manual Save or the Ops switch can still lock a row later.

update public.nfl_player_pvals
set is_custom_override = false,
    updated_at = now()
where is_custom_override = true;
