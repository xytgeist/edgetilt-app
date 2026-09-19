-- Release a login phone so another account can claim it.
-- Service role only. The edge function verifies the SMS code first.
-- Does not run unless the account already has a confirmed email identity.

begin;

create or replace function public.release_account_phone(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  confirmed_email timestamptz;
  other_identities int;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'PHONE_RELEASE_FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'PHONE_RELEASE_FORBIDDEN';
  end if;

  select u.email_confirmed_at
    into confirmed_email
  from auth.users u
  where u.id = p_user_id;

  if confirmed_email is null then
    raise exception 'EMAIL_NOT_CONFIRMED';
  end if;

  select count(*)
    into other_identities
  from auth.identities i
  where i.user_id = p_user_id
    and i.provider is distinct from 'phone';

  if other_identities < 1 then
    raise exception 'EMAIL_IDENTITY_REQUIRED';
  end if;

  delete from auth.identities
  where user_id = p_user_id
    and provider = 'phone';

  update auth.users
  set
    phone = null,
    phone_confirmed_at = null,
    phone_change = '',
    phone_change_token = '',
    phone_change_sent_at = null
  where id = p_user_id;

  update public.profiles
  set phone_number = null
  where user_id = p_user_id;
end;
$$;

comment on function public.release_account_phone(uuid) is
  'Clears the login phone after the account has a confirmed email. Service role only. SMS proof happens in account-phone-release.';

revoke all on function public.release_account_phone(uuid) from public;
revoke all on function public.release_account_phone(uuid) from anon;
revoke all on function public.release_account_phone(uuid) from authenticated;
grant execute on function public.release_account_phone(uuid) to service_role;

commit;
