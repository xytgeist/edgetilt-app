-- ============================================================
-- Chat Phase 2 — conversation list metadata, read receipts,
-- reactions, soft delete, inline replies, room mute, roles.
-- Apply on test Supabase before any Phase 3 client work.
-- Run AFTER chat_phase1.sql is already applied.
-- ============================================================

begin;

-- ── 1. chat_rooms: denormalized last-message columns ─────────────────────────
-- Used to sort the conversation list without a per-room messages query.

alter table public.chat_rooms
  add column if not exists last_message_at          timestamptz,
  add column if not exists last_message_preview     text,
  add column if not exists last_message_sender_id   uuid
    references auth.users (id) on delete set null;

create index if not exists chat_rooms_last_message_at_idx
  on public.chat_rooms (last_message_at desc nulls last);

-- ── 2. chat_room_members: read receipts + mute + role ────────────────────────

alter table public.chat_room_members
  add column if not exists last_read_message_id  uuid
    references public.chat_messages (id) on delete set null,
  add column if not exists last_read_at           timestamptz,
  add column if not exists muted_until            timestamptz,
  add column if not exists role                   text not null default 'member'
    check (role in ('member', 'admin'));

-- ── 3. chat_messages: inline replies + soft delete ───────────────────────────

alter table public.chat_messages
  add column if not exists reply_to_message_id  uuid
    references public.chat_messages (id) on delete set null,
  add column if not exists reply_to_preview      text,
  add column if not exists deleted_at            timestamptz;

-- ── 4. chat_message_reactions ────────────────────────────────────────────────

create table if not exists public.chat_message_reactions (
  id          uuid          primary key default gen_random_uuid(),
  message_id  uuid          not null references public.chat_messages (id) on delete cascade,
  user_id     uuid          not null references auth.users (id) on delete cascade,
  emoji       text          not null,
  created_at  timestamptz   not null default now(),
  constraint chat_message_reactions_emoji_len check (char_length(emoji) <= 8),
  unique (message_id, user_id, emoji)
);

create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions (message_id);

alter table public.chat_message_reactions enable row level security;

-- Room members can read reactions on messages in their rooms.
drop policy if exists "chat_message_reactions_select" on public.chat_message_reactions;
create policy "chat_message_reactions_select"
  on public.chat_message_reactions for select
  using (
    exists (
      select 1
      from   public.chat_messages msg
      join   public.chat_room_members mem on mem.room_id = msg.room_id
      where  msg.id  = chat_message_reactions.message_id
        and  mem.user_id = (select auth.uid())
    )
  );

drop policy if exists "chat_message_reactions_insert" on public.chat_message_reactions;
create policy "chat_message_reactions_insert"
  on public.chat_message_reactions for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from   public.chat_messages msg
      join   public.chat_room_members mem on mem.room_id = msg.room_id
      where  msg.id  = chat_message_reactions.message_id
        and  mem.user_id = (select auth.uid())
    )
  );

drop policy if exists "chat_message_reactions_delete" on public.chat_message_reactions;
create policy "chat_message_reactions_delete"
  on public.chat_message_reactions for delete
  using (user_id = (select auth.uid()));

-- ── 5. Trigger: keep chat_rooms last-message columns fresh ───────────────────

create or replace function public.chat_rooms_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
begin
  if NEW.deleted_at is not null then
    v_preview := 'This message was deleted';
  elsif char_length(trim(coalesce(NEW.body, ''))) > 0 then
    v_preview := left(trim(NEW.body), 60);
    if char_length(trim(NEW.body)) > 60 then
      v_preview := v_preview || '…';
    end if;
  elsif coalesce(cardinality(NEW.image_urls), 0) > 0 then
    v_preview := '[image]';
  else
    v_preview := '';
  end if;

  update public.chat_rooms
  set
    last_message_at        = NEW.created_at,
    last_message_preview   = v_preview,
    last_message_sender_id = NEW.sender_id
  where id = NEW.room_id;

  return NEW;
end;
$$;

drop trigger if exists chat_messages_after_insert_update_room
  on public.chat_messages;

create trigger chat_messages_after_insert_update_room
  after insert on public.chat_messages
  for each row execute function public.chat_rooms_on_message_insert();

commit;
