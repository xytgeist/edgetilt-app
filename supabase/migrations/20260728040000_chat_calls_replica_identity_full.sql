-- Realtime + RLS: default replica identity can drop INSERT/UPDATE deliveries to members.
-- FULL ensures the new row is available for chat_calls_select_member filtering.

begin;

alter table public.chat_calls replica identity full;

commit;
