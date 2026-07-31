-- Lounge handles excluded from Edge Monitor product analytics (plus all profiles.role = admin).
-- Manage via SQL editor: insert into public.app_product_analytics_excluded_handles (handle, note) values ('smokewagon', 'test account');

create table if not exists public.app_product_analytics_excluded_handles (
  handle text primary key,
  note text,
  created_at timestamptz not null default now(),
  constraint app_product_analytics_excluded_handles_handle_check check (
    handle = lower(btrim(handle))
    and handle ~ '^[a-z0-9_]{2,30}$'
  )
);

comment on table public.app_product_analytics_excluded_handles is
  'Lowercase Lounge handles omitted from app_section_visits recording and Monitor aggregates. Admins always excluded by role.';
