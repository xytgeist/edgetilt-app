-- ============================================================
-- Chat DM push notifications + user blocking
-- Apply after chat_rpcs (20260601140000).
-- ============================================================

begin;

-- ── 1. Extend activity_events for chat_dm ─────────────────────────────────

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid',
      'chat_dm'
    )
  );

-- chat_room_id: deep-link target for DM push notifications
alter table public.activity_events
  add column if not exists chat_room_id uuid
    references public.chat_rooms (id) on delete set null;

-- ── 2. blocks table ───────────────────────────────────────────────────────
-- Mutual check: open_dm checks both directions before creating a room.
-- push: send_message skips push if recipient blocks the sender.

create table if not exists public.blocks (
  id         uuid        primary key default gen_random_uuid(),
  blocker_id uuid        not null references auth.users (id) on delete cascade,
  blocked_id uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_unique  unique (blocker_id, blocked_id),
  constraint blocks_no_self check  (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- Each user can see block rows where they appear on either side (needed for UI)
drop policy if exists "blocks_select_participant" on public.blocks;
create policy "blocks_select_participant" on public.blocks
  for select using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));

-- Only the blocker can insert/delete their own blocks
drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own" on public.blocks
  for insert with check (blocker_id = (select auth.uid()));

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own" on public.blocks
  for delete using (blocker_id = (select auth.uid()));

commit;
