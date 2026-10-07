-- Context-alert / gap-queue dedupe: publish_log CHECK was rejecting kinds like
-- fade_the_public (insert error ignored), and the scheduled unique only covered
-- pending. poll_edges then re-queued the same key after the first row published.
-- Keep the 2-minute gap queue. Do not cancel failed/cancelled retries.

alter table public.lounge_bot_publish_log
  drop constraint if exists lounge_bot_publish_log_post_kind_check;

comment on column public.lounge_bot_publish_log.post_kind is
  'Alert family slug (edge, fade_the_public, starter_spotlight, ...). Unconstrained so new kinds can log.';

with ranked as (
  select
    id,
    row_number() over (
      partition by bot_user_id, dedupe_key
      order by
        case when status = 'published' then 0 else 1 end,
        created_at asc,
        id asc
    ) as rn
  from public.lounge_bot_scheduled_posts
  where status in ('pending', 'published')
    and dedupe_key is not null
)
update public.lounge_bot_scheduled_posts as s
set
  status = 'cancelled',
  error_message = 'duplicate_live_dedupe_key'
from ranked as r
where s.id = r.id
  and r.rn > 1;

drop index if exists public.lounge_bot_scheduled_posts_pending_dedupe_idx;

create unique index if not exists lounge_bot_scheduled_posts_live_dedupe_idx
  on public.lounge_bot_scheduled_posts (bot_user_id, dedupe_key)
  where status in ('pending', 'published') and dedupe_key is not null;

comment on index public.lounge_bot_scheduled_posts_live_dedupe_idx is
  'One live queue row per bot + dedupe_key (pending or already published). Failed/cancelled may retry.';

insert into public.lounge_bot_publish_log (
  bot_user_id, post_id, caption, score, status, post_kind, dedupe_key
)
select
  s.bot_user_id,
  s.post_id,
  s.caption,
  s.score,
  'published',
  s.post_kind,
  s.dedupe_key
from public.lounge_bot_scheduled_posts as s
where s.status = 'published'
  and s.post_id is not null
  and s.dedupe_key is not null
  and not exists (
    select 1
    from public.lounge_bot_publish_log as l
    where l.bot_user_id = s.bot_user_id
      and l.dedupe_key = s.dedupe_key
      and l.status = 'published'
  );
