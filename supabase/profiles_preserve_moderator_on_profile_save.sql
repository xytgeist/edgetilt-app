-- Replaces `profiles_enforce_role_change` so staff are not demoted to `user` on self-service profile saves.
-- Apply in Supabase → SQL Editor after `feed_phase_a_profiles_public_read.sql` (safe to re-run).
--
-- Symptom: profile upsert omitted `role`; PostgREST left `role` as `user`. The app now re-sends `role` for staff;
-- this trigger is a second line of defense.

create or replace function public.profiles_enforce_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.role in ('moderator', 'admin')
     and new.role = 'user'
     and auth.uid() is not null
     and auth.uid() = new.user_id then
    new.role := old.role;
  end if;

  if new.role is distinct from old.role then
    if not exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    ) then
      raise exception 'Role change requires admin';
    end if;
  end if;
  return new;
end;
$$;
