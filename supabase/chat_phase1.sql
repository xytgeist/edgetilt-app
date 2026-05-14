-- Chat phase 1: DM + small group rooms + subscriber-only topic channels.
-- Apply on test (then prod) before relying on chat UI.
-- TLS in transit + provider at rest; message bodies are plaintext in DB for v1 (upgrade path: content_encoding / body_cipher columns).

begin;

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'group', 'channel')),
  slug text unique,
  title text,
  topic_key text,
  dm_key text,
  max_members int not null default 10,
  subscriber_only boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chat_rooms_dm_key_when_dm check (
    kind <> 'dm' or (dm_key is not null and length(trim(dm_key)) > 0)
  ),
  constraint chat_rooms_slug_when_channel check (
    kind <> 'channel' or (slug is not null and length(trim(slug)) > 0)
  )
);

create unique index if not exists chat_rooms_dm_key_unique on public.chat_rooms (dm_key) where kind = 'dm';

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists chat_room_members_user_id_idx on public.chat_room_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  image_urls text[] default '{}'::text[],
  content_encoding text not null default 'plain',
  body_cipher bytea,
  nonce bytea,
  key_version smallint,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_len check (char_length(body) <= 8000),
  constraint chat_messages_image_urls_len check (
    image_urls is null or coalesce(cardinality(image_urls), 0) <= 4
  )
);

create index if not exists chat_messages_room_created_idx on public.chat_messages (room_id, created_at desc);

-- --- RLS ---
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_rooms_select_member" on public.chat_rooms;
create policy "chat_rooms_select_member" on public.chat_rooms for select using (
  exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_rooms.id and m.user_id = (select auth.uid())
  )
);

-- Members: each user may only read **their own** membership rows. (A policy that ORs
-- "other members in same room" via EXISTS on this same table causes **infinite RLS recursion**.)
drop policy if exists "chat_room_members_select_self" on public.chat_room_members;
create policy "chat_room_members_select_self" on public.chat_room_members for select using (
  user_id = (select auth.uid())
);

drop policy if exists "chat_messages_select_member" on public.chat_messages;
create policy "chat_messages_select_member" on public.chat_messages for select using (
  exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_messages.room_id and m.user_id = (select auth.uid())
  )
);

-- Inserts for rooms/members/messages are performed by Edge (service role) after validation.

-- --- Seed universal channels (subscriber-only, max 1000) ---
insert into public.chat_rooms (kind, slug, title, topic_key, max_members, subscriber_only)
values
  ('channel', 'crypto', 'Crypto', 'crypto', 1000, true),
  ('channel', 'stonks', 'Stonks', 'stonks', 1000, true),
  ('channel', 'investing', 'Investing', 'investing', 1000, true),
  ('channel', 'poker', 'Poker', 'poker', 1000, true),
  ('channel', 'sports', 'Sports', 'sports', 1000, true),
  ('channel', 'ap-slots', 'AP Slots', 'ap_slots', 1000, true),
  ('channel', 'ap-tables', 'AP Tables', 'ap_tables', 1000, true)
on conflict (slug) do nothing;

commit;
