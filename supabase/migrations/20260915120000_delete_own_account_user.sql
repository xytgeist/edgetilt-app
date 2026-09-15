-- GoTrue admin.deleteUser returns a generic "Database error deleting user" when
-- app triggers (Lounge denorm, poker stable, chat cleanup) abort the cascade.
-- Delete via SECURITY DEFINER with replica role so FKs still apply and triggers
-- cannot abort. service_role only … Edge delete-own-account is the caller.
--
-- Also: do not CASCADE-delete group chats just because the creator left.

alter table public.chat_rooms
  drop constraint if exists chat_rooms_creator_user_id_fkey;

alter table public.chat_rooms
  add constraint chat_rooms_creator_user_id_fkey
  foreign key (creator_user_id) references auth.users (id) on delete set null;

drop function if exists public.delete_own_account_user(uuid);

create or replace function public.delete_own_account_user()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in again, then delete the account.');
  end if;

  update public.chat_rooms
  set creator_user_id = null
  where creator_user_id = uid;

  -- Skip user triggers on cascaded public-table deletes. FKs still fire.
  perform set_config('session_replication_role', 'replica', true);

  delete from auth.users
  where id = uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Account was already deleted.');
  end if;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.delete_own_account_user() from public;
revoke all on function public.delete_own_account_user() from anon;
grant execute on function public.delete_own_account_user() to authenticated;
grant execute on function public.delete_own_account_user() to service_role;

notify pgrst, 'reload schema';
