-- Lowercase emails omitted from Edge Monitor product analytics (plus admin role + handle blocklist + bot auth emails).

create table if not exists public.app_product_analytics_excluded_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now(),
  constraint app_product_analytics_excluded_emails_email_check check (
    email = lower(btrim(email))
    and email ~ '^[^@]+@[^@]+\.[^@]+$'
  )
);

comment on table public.app_product_analytics_excluded_emails is
  'Lowercase auth emails omitted from app_section_visits recording and Monitor aggregates. Bot service accounts (@bots.edgetilt.local) are excluded by pattern in app_product_analytics_user_excluded().';
