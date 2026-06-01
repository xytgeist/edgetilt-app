-- ============================================================
-- Chat RPCs — replace multi-round-trip client queries with
-- single server-side calls. Apply after chat_phase2.
-- ============================================================

begin;

-- ── 1. chat_rooms_for_user ────────────────────────────────────────────────
-- Returns the full conversation list for a user in one query:
-- room metadata + member state + DM peer profile + last-message sender name.
-- Replaces the 3-query client pattern (members → rooms → profiles).

create or replace function public.chat_rooms_for_user(
  p_user_id uuid default auth.uid()
)
returns table (
  id                     uuid,
  kind                   text,
  slug                   text,
  title                  text,
  dm_key                 text,
  subscriber_only        boolean,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  last_read_at           timestamptz,
  muted_until            timestamptz,
  member_role            text,
  has_unread             boolean,
  -- DM peer (null for channels / groups)
  peer_user_id           uuid,
  peer_handle            text,
  peer_display_name      text,
  peer_avatar_url        text,
  -- Last-message sender name for preview line
  sender_handle          text,
  sender_display_name    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.kind,
    r.slug,
    r.title,
    r.dm_key,
    r.subscriber_only,
    r.last_message_at,
    r.last_message_preview,
    r.last_message_sender_id,
    m.last_read_at,
    m.muted_until,
    m.role,
    (
      r.last_message_at is not null
      and (m.last_read_at is null or r.last_message_at > m.last_read_at)
    ) as has_unread,
    -- DM peer — extract from dm_key "<uid_a>::<uid_b>"
    peer_prof.user_id,
    peer_prof.handle,
    peer_prof.display_name,
    peer_prof.avatar_url,
    -- Last-message sender (for "You:" / "@handle:" preview prefix)
    sender_prof.handle,
    sender_prof.display_name
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.room_id
  left join public.profiles peer_prof
    on r.kind = 'dm'
    and peer_prof.user_id = case
      when r.dm_key is null then null::uuid
      when split_part(r.dm_key, '::', 1)::text = p_user_id::text
      then split_part(r.dm_key, '::', 2)::uuid
      else split_part(r.dm_key, '::', 1)::uuid
    end
  left join public.profiles sender_prof
    on sender_prof.user_id = r.last_message_sender_id
  where m.user_id = p_user_id
  order by r.last_message_at desc nulls last
$$;

revoke all on function public.chat_rooms_for_user(uuid) from public, anon;
grant execute on function public.chat_rooms_for_user(uuid) to authenticated;

-- ── 2. chat_message_reactions_agg ────────────────────────────────────────
-- Returns aggregated reaction counts for a batch of messages — one row per
-- (message, emoji). Replaces fetching every individual reaction row and
-- grouping client-side.
-- At scale: 500 reactions on a popular message → 1 row per emoji, not 500.

create or replace function public.chat_message_reactions_agg(
  p_message_ids  uuid[],
  p_viewer_id    uuid default auth.uid()
)
returns table (
  message_id      uuid,
  emoji           text,
  reaction_count  bigint,
  viewer_reacted  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.message_id,
    r.emoji,
    count(*)                            as reaction_count,
    bool_or(r.user_id = p_viewer_id)   as viewer_reacted
  from public.chat_message_reactions r
  where r.message_id = any(p_message_ids)
  group by r.message_id, r.emoji
  order by r.message_id, count(*) desc
$$;

revoke all on function public.chat_message_reactions_agg(uuid[], uuid) from public, anon;
grant execute on function public.chat_message_reactions_agg(uuid[], uuid) to authenticated;

commit;
