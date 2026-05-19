-- Admin promote/demote in-app (apply on test after feed_phase_a_profiles_public_read.sql).
-- Same body as migration 20260518120000_admin_set_profile_role.sql.

create or replace function public.admin_set_profile_role(
  p_target_user_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if p_target_user_id is null then
    raise exception 'target user required';
  end if;

  if p_role is null or p_role not in ('user', 'moderator', 'admin') then
    raise exception 'invalid role';
  end if;

  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'admin only';
  end if;

  if p_target_user_id = auth.uid() and p_role is distinct from 'admin' then
    raise exception 'admins cannot demote themselves';
  end if;

  update public.profiles
  set
    role = p_role,
    updated_at = now()
  where user_id = p_target_user_id
  returning * into v_row;

  if v_row.user_id is null then
    raise exception 'profile not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_set_profile_role(uuid, text) from public;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;

comment on function public.admin_set_profile_role(uuid, text) is
  'Set profiles.role for another member. Authenticated caller must be admin.';
