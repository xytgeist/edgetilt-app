-- Sign-in form: tell "wrong password" apart from "no account" (GoTrue returns invalid_credentials for both).
-- Returns 'none' | 'password' | 'oauth'. Ryan accepted the email-enumeration trade (2026-09-29) so a bad
-- password no longer drops people into Create account.

create or replace function public.auth_email_sign_in_kind(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
  v_has_password boolean;
begin
  if v_email = '' or length(v_email) > 320 or position('@' in v_email) = 0 then
    return 'none';
  end if;

  select u.id, coalesce(u.encrypted_password, '') <> ''
    into v_user_id, v_has_password
  from auth.users u
  where lower(u.email) = v_email
    and u.deleted_at is null
  limit 1;

  if v_user_id is null then
    return 'none';
  end if;
  if v_has_password then
    return 'password';
  end if;
  return 'oauth';
end;
$$;

revoke all on function public.auth_email_sign_in_kind(text) from public;
grant execute on function public.auth_email_sign_in_kind(text) to anon, authenticated;
