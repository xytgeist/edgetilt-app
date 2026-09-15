-- Roll back 20260915120000. That FK change was unrelated to 018393a2
-- and must not stay on test.

drop function if exists public.delete_own_account_user();
drop function if exists public.delete_own_account_user(uuid);

alter table public.chat_rooms
  drop constraint if exists chat_rooms_creator_user_id_fkey;

alter table public.chat_rooms
  add constraint chat_rooms_creator_user_id_fkey
  foreign key (creator_user_id) references auth.users (id) on delete cascade;
