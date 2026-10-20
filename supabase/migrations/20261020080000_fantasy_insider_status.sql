-- Phase 3: insider posts can move a player's status (and trigger the starter push) ahead of ESPN's report.
-- `next_status` is the next-game designation the LLM read from the post; `status_trusted` = core national / Underdog /
-- Caplan / that team's beat writer; `status_applied_at` = handed to the starter push path.
alter table public.fantasy_insider_news
  add column if not exists next_status text check (next_status in ('out', 'doubtful', 'ir', 'questionable', 'cleared')),
  add column if not exists status_sleeper_id text,
  add column if not exists status_injury text,
  add column if not exists status_trusted boolean not null default false,
  add column if not exists status_applied_at timestamptz;

-- Re-enable the poller. The Edge only reads X inside news windows (Sun inactives, Mon / Thu pregame, Wed-Sat practice
-- reports) and starts from "now" when a window opens, so posts outside the windows are never read.
do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_insider_poll'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule('fantasy_insider_poll', '*/2 * * * *', $$select public.invoke_fantasy_insider_poll();$$);
