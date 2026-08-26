-- EdgeiOS APNs device tokens (separate from web-push push_subscriptions).
-- Unique on token so a phone reclaiming a new account overwrites the old row.

create table if not exists public.apns_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  bundle_id text not null default 'com.edgetilt.app',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apns_device_tokens_user_id_idx
  on public.apns_device_tokens (user_id);

create or replace function public.set_apns_device_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_apns_device_tokens_updated_at on public.apns_device_tokens;
create trigger trg_apns_device_tokens_updated_at
before update on public.apns_device_tokens
for each row
execute function public.set_apns_device_tokens_updated_at();

alter table public.apns_device_tokens enable row level security;

drop policy if exists "Users read own apns device tokens" on public.apns_device_tokens;
create policy "Users read own apns device tokens"
on public.apns_device_tokens
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own apns device tokens" on public.apns_device_tokens;
create policy "Users insert own apns device tokens"
on public.apns_device_tokens
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own apns device tokens" on public.apns_device_tokens;
create policy "Users update own apns device tokens"
on public.apns_device_tokens
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own apns device tokens" on public.apns_device_tokens;
create policy "Users delete own apns device tokens"
on public.apns_device_tokens
for delete
using (auth.uid() = user_id);

create or replace function public.upsert_my_apns_device_token(
  p_token text,
  p_environment text default 'sandbox',
  p_bundle_id text default 'com.edgetilt.app',
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  env text;
  bundle text;
  tok text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  tok := lower(trim(coalesce(p_token, '')));
  if tok = '' or tok !~ '^[0-9a-f]{64,}$' or (length(tok) % 2) <> 0 then
    raise exception 'Invalid APNs device token';
  end if;

  env := lower(trim(coalesce(p_environment, 'sandbox')));
  if env not in ('sandbox', 'production') then
    env := 'sandbox';
  end if;

  bundle := trim(coalesce(p_bundle_id, 'com.edgetilt.app'));
  if bundle = '' then
    bundle := 'com.edgetilt.app';
  end if;

  delete from public.apns_device_tokens
  where token = tok;

  insert into public.apns_device_tokens (
    user_id,
    token,
    environment,
    bundle_id,
    user_agent
  )
  values (
    uid,
    tok,
    env,
    bundle,
    p_user_agent
  )
  returning id into rid;

  return rid;
end;
$$;

create or replace function public.delete_my_apns_device_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tok text;
  deleted_count int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  tok := lower(trim(coalesce(p_token, '')));
  if tok = '' then
    return false;
  end if;

  delete from public.apns_device_tokens
  where user_id = uid
    and token = tok;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.upsert_my_apns_device_token(text, text, text, text) from public;
grant execute on function public.upsert_my_apns_device_token(text, text, text, text) to authenticated;

revoke all on function public.delete_my_apns_device_token(text) from public;
grant execute on function public.delete_my_apns_device_token(text) to authenticated;

comment on table public.apns_device_tokens is
  'EdgeiOS APNs hex device tokens. Web push stays in push_subscriptions.';

comment on function public.upsert_my_apns_device_token(text, text, text, text) is
  'Reclaim an APNs device token for the signed-in user.';

comment on function public.delete_my_apns_device_token(text) is
  'Remove this device token for the signed-in user (Settings toggle off).';

