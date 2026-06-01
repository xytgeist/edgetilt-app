-- ============================================================
-- Chat: index fixes + server-side message page RPC
-- Apply after chat_rpcs (20260601140000).
-- ============================================================

begin;

-- ── 1. Fix chat_messages index ────────────────────────────────────────────
-- Phase 1 created (room_id, created_at DESC) but our composite cursor orders
-- and filters on (created_at DESC, id DESC). Without `id` in the index Postgres
-- has to do a post-filter sort for the id tiebreaker on every page load.

drop index if exists public.chat_messages_room_created_idx;

create index if not exists chat_messages_room_created_id_idx
  on public.chat_messages (room_id, created_at desc, id desc);

-- ── 2. Index for reaction aggregation RPC ────────────────────────────────
-- chat_message_reactions had no index at all. The aggregation RPC does:
--   WHERE message_id = ANY($1) GROUP BY message_id, emoji
-- Without this, every conversation open is a full table scan.

create index if not exists chat_message_reactions_message_id_idx
  on public.chat_message_reactions (message_id);

-- Unique constraint to prevent duplicate reactions per (user, message, emoji)
create unique index if not exists chat_message_reactions_unique_idx
  on public.chat_message_reactions (message_id, user_id, emoji);

-- ── 3. chat_messages_page RPC ─────────────────────────────────────────────
-- Replaces the client's direct table query for initial load and pagination.
--
-- Why this matters at scale:
--   The RLS policy on chat_messages runs an EXISTS subquery on chat_room_members
--   for EVERY ROW returned. Loading 50 messages = 50 EXISTS checks. A SECURITY
--   DEFINER function checks membership ONCE, then returns rows without per-row
--   RLS overhead — same security model, dramatically lower DB work at scale.
--
-- Supports initial load (p_before_* null) and cursor-based pagination.

create or replace function public.chat_messages_page(
  p_room_id            uuid,
  p_limit              int         default 50,
  p_before_created_at  timestamptz default null,
  p_before_id          uuid        default null
)
returns table (
  id                  uuid,
  room_id             uuid,
  sender_id           uuid,
  body                text,
  image_urls          text[],
  created_at          timestamptz,
  deleted_at          timestamptz,
  reply_to_message_id uuid,
  reply_to_preview    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int;
begin
  -- Membership check — runs once, not per row
  if not exists (
    select 1
    from public.chat_room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'NOT_MEMBER'
      using message = 'You are not a member of this room.';
  end if;

  lim := greatest(1, least(coalesce(p_limit, 50), 100));

  if p_before_created_at is null then
    -- Initial load: most recent page
    return query
      select
        msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
        msg.created_at, msg.deleted_at, msg.reply_to_message_id, msg.reply_to_preview
      from public.chat_messages msg
      where msg.room_id = p_room_id
      order by msg.created_at desc, msg.id desc
      limit lim;
  else
    -- Paginated load: composite cursor prevents timestamp-collision skips
    return query
      select
        msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
        msg.created_at, msg.deleted_at, msg.reply_to_message_id, msg.reply_to_preview
      from public.chat_messages msg
      where msg.room_id = p_room_id
        and (
          msg.created_at < p_before_created_at
          or (msg.created_at = p_before_created_at and msg.id < p_before_id)
        )
      order by msg.created_at desc, msg.id desc
      limit lim;
  end if;
end;
$$;

revoke all on function public.chat_messages_page(uuid, int, timestamptz, uuid) from public, anon;
grant execute on function public.chat_messages_page(uuid, int, timestamptz, uuid) to authenticated;

commit;
