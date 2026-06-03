-- ============================================================
-- Add after-cursor support to chat_messages_page for reconnect catchup.
-- After a WebSocket drop/reconnect, the client fetches any messages that
-- arrived during the gap using (p_after_created_at, p_after_id).
--
-- SUPERSEDED for manual SQL runs: if you already applied
-- 20260604180100_chat_messages_rpc_link_preview.sql, do NOT run this file —
-- it will error (return type mismatch) or strip link_preview from the RPC.
-- ============================================================

begin;

-- 011500 created the 4-arg overload; this migration adds the 6-arg function.
drop function if exists public.chat_messages_page(uuid, int, timestamptz, uuid);

create or replace function public.chat_messages_page(
  p_room_id            uuid,
  p_limit              int         default 50,
  -- Older-page cursor (both null = initial load, newest messages first)
  p_before_created_at  timestamptz default null,
  p_before_id          uuid        default null,
  -- Reconnect catchup cursor (fetches messages AFTER the last known message)
  p_after_created_at   timestamptz default null,
  p_after_id           uuid        default null
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
  -- Membership check — once, not per row
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

  -- ── Reconnect catchup: messages AFTER a known point, chronological order ──
  if p_after_created_at is not null then
    return query
      select
        msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
        msg.created_at, msg.deleted_at, msg.reply_to_message_id, msg.reply_to_preview
      from public.chat_messages msg
      where msg.room_id = p_room_id
        and (
          msg.created_at > p_after_created_at
          or (msg.created_at = p_after_created_at and msg.id > p_after_id)
        )
      order by msg.created_at asc, msg.id asc
      limit lim;
    return;
  end if;

  -- ── Older-page load: messages BEFORE a known point, reverse chronological ─
  if p_before_created_at is not null then
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
    return;
  end if;

  -- ── Initial load: most recent page ───────────────────────────────────────
  return query
    select
      msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
      msg.created_at, msg.deleted_at, msg.reply_to_message_id, msg.reply_to_preview
    from public.chat_messages msg
    where msg.room_id = p_room_id
    order by msg.created_at desc, msg.id desc
    limit lim;
end;
$$;

revoke all on function public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) to authenticated;


commit;
