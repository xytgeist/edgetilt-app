-- Android shell (EdgeAndroid) FCM registration tokens. Separate from APNs hex tokens
-- and web-push push_subscriptions. Unique on token so a phone reclaiming a new account
-- overwrites the old row.

create table if not exists public.fcm_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  app_id text not null default 'com.edgetilt.app',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fcm_device_tokens_user_id_idx
  on public.fcm_device_tokens (user_id);

create or replace function public.set_fcm_device_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fcm_device_tokens_updated_at on public.fcm_device_tokens;
create trigger trg_fcm_device_tokens_updated_at
before update on public.fcm_device_tokens
for each row
execute function public.set_fcm_device_tokens_updated_at();

alter table public.fcm_device_tokens enable row level security;

drop policy if exists "Users read own fcm device tokens" on public.fcm_device_tokens;
create policy "Users read own fcm device tokens"
on public.fcm_device_tokens
for select
using (auth.uid() = user_id);

drop policy if exists "Users delete own fcm device tokens" on public.fcm_device_tokens;
create policy "Users delete own fcm device tokens"
on public.fcm_device_tokens
for delete
using (auth.uid() = user_id);

create or replace function public.upsert_my_fcm_device_token(
  p_token text,
  p_app_id text default 'com.edgetilt.app',
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
  tok text;
  app text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  tok := trim(coalesce(p_token, ''));
  if length(tok) < 32 or length(tok) > 4096 or tok ~ '\s' then
    raise exception 'Invalid FCM token';
  end if;

  app := trim(coalesce(p_app_id, 'com.edgetilt.app'));
  if app !~ '^com\.edgetilt\.app(\.test)?$' then
    app := 'com.edgetilt.app';
  end if;

  delete from public.fcm_device_tokens where token = tok;

  insert into public.fcm_device_tokens (user_id, token, app_id, user_agent)
  values (uid, tok, app, left(p_user_agent, 512))
  returning id into rid;

  return rid;
end;
$$;

create or replace function public.delete_my_fcm_device_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  deleted_count int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.fcm_device_tokens
  where user_id = uid
    and token = trim(coalesce(p_token, ''));

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.upsert_my_fcm_device_token(text, text, text) from public;
grant execute on function public.upsert_my_fcm_device_token(text, text, text) to authenticated;

revoke all on function public.delete_my_fcm_device_token(text) from public;
grant execute on function public.delete_my_fcm_device_token(text) to authenticated;

comment on table public.fcm_device_tokens is
  'EdgeAndroid shell FCM registration tokens. APNs stays in apns_device_tokens, web push in push_subscriptions.';
