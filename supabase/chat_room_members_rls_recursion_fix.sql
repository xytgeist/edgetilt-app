-- Fix infinite recursion on chat_room_members SELECT policy (EXISTS subquery scanned same table).
-- Run on test/prod if you already applied an older chat_phase1.sql that used the OR + EXISTS variant.

begin;

drop policy if exists "chat_room_members_select_self" on public.chat_room_members;
create policy "chat_room_members_select_self" on public.chat_room_members for select using (
  user_id = (select auth.uid())
);

commit;
