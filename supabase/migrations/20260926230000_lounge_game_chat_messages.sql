-- Game Hub live chat: lightweight per-game room keyed by scoreboard event id.
-- Not Lounge posts and not the membership-based chat_rooms stack (no inbox rows / unread).

create table if not exists public.lounge_game_chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id text not null check (char_length(event_id) between 1 and 120),
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists lounge_game_chat_messages_event_created_idx
  on public.lounge_game_chat_messages (event_id, created_at desc);

alter table public.lounge_game_chat_messages enable row level security;

drop policy if exists lounge_game_chat_select on public.lounge_game_chat_messages;
create policy lounge_game_chat_select on public.lounge_game_chat_messages
  for select to anon, authenticated
  using (true);

drop policy if exists lounge_game_chat_insert_own on public.lounge_game_chat_messages;
create policy lounge_game_chat_insert_own on public.lounge_game_chat_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.banned_at is null
    )
  );

drop policy if exists lounge_game_chat_delete_own_or_staff on public.lounge_game_chat_messages;
create policy lounge_game_chat_delete_own_or_staff on public.lounge_game_chat_messages
  for delete to authenticated
  using (user_id = auth.uid() or public.current_user_has_staff_role());

-- One message per user per game every 2s (spam guard; client shows the error).
create or replace function public.lounge_game_chat_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.lounge_game_chat_messages m
    where m.user_id = new.user_id
      and m.event_id = new.event_id
      and m.created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Slow down a second and try again.' using errcode = 'P0001';
  end if;
  new.body := btrim(new.body);
  return new;
end;
$$;

drop trigger if exists lounge_game_chat_rate_limit on public.lounge_game_chat_messages;
create trigger lounge_game_chat_rate_limit
  before insert on public.lounge_game_chat_messages
  for each row execute function public.lounge_game_chat_rate_limit();

grant select on public.lounge_game_chat_messages to anon, authenticated;
grant insert, delete on public.lounge_game_chat_messages to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'lounge_game_chat_messages'
     ) then
    alter publication supabase_realtime add table public.lounge_game_chat_messages;
  end if;
end;
$$;
