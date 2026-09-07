-- Farm ingest door: lounge personas posted by an external worker (not Grok-in-app).
-- pipeline=farm is automatic (brain already decided). Kill switch = enabled + run_state.

begin;

alter table public.lounge_bot_accounts
  drop constraint if exists lounge_bot_accounts_pipeline_check;

alter table public.lounge_bot_accounts
  add constraint lounge_bot_accounts_pipeline_check
  check (pipeline in ('odds_api', 'market_news', 'x', 'manual', 'farm'));

alter table public.lounge_bot_accounts
  drop constraint if exists lounge_bot_accounts_review_mode_pipeline;

alter table public.lounge_bot_accounts
  add constraint lounge_bot_accounts_review_mode_pipeline
  check (
    (pipeline = 'x' and review_mode = 'editorial')
    or (pipeline in ('odds_api', 'market_news', 'farm') and review_mode = 'automatic')
    or (pipeline = 'manual')
  );

comment on constraint lounge_bot_accounts_pipeline_check on public.lounge_bot_accounts is
  'odds_api / market_news / x / manual in-app pipelines; farm = external ingest door only.';

commit;
