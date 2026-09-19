-- Public phone-verified flag for the Lounge check. Copies auth.users.phone_confirmed_at.
-- Does not expose the phone number. Clients cannot stamp it.

begin;

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.phone_verified_at is
  'Copied from auth.users.phone_confirmed_at. Public. Does not include the phone number.';

create or replace function public.profiles_lock_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  confirmed_at timestamptz;
begin
  if current_setting('edge.phone_verified_sync', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select u.phone_confirmed_at
      into confirmed_at
    from auth.users u
    where u.id = new.user_id
      and u.phone_confirmed_at is not null
      and nullif(btrim(coalesce(u.phone, '')), '') is not null;
    new.phone_verified_at := confirmed_at;
    return new;
  end if;
  if new.phone_verified_at is distinct from old.phone_verified_at then
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_phone_verified on public.profiles;
drop trigger if exists trg_profiles_lock_phone_verified on public.profiles;
create trigger trg_profiles_lock_phone_verified
  before insert or update on public.profiles
  for each row
  execute function public.profiles_lock_phone_verified();

create or replace function public.sync_profile_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('edge.phone_verified_sync', '1', true);
  update public.profiles
  set phone_verified_at = case
    when new.phone_confirmed_at is not null
     and nullif(btrim(coalesce(new.phone, '')), '') is not null
    then new.phone_confirmed_at
    else null
  end
  where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_auth_users_sync_phone_verified on auth.users;
create trigger trg_auth_users_sync_phone_verified
  after insert or update of phone, phone_confirmed_at
  on auth.users
  for each row
  execute function public.sync_profile_phone_verified();

with cfg as (
  select set_config('edge.phone_verified_sync', '1', true) as ok
)
update public.profiles p
set phone_verified_at = u.phone_confirmed_at
from auth.users u, cfg
where p.user_id = u.id
  and u.phone_confirmed_at is not null
  and nullif(btrim(coalesce(u.phone, '')), '') is not null
  and p.phone_verified_at is distinct from u.phone_confirmed_at;

commit;
