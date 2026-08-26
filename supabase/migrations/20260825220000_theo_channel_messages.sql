-- Dual-machine Theo mailbox (test / lvslotpro.com only). Do not apply on production.

create table if not exists public.theo_channel_messages (
  id uuid primary key default gen_random_uuid(),
  author text not null check (author in ('windows', 'mac', 'ryan')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists theo_channel_messages_created_at_idx
  on public.theo_channel_messages (created_at desc);

alter table public.theo_channel_messages enable row level security;

drop policy if exists "Public read theo channel" on public.theo_channel_messages;
create policy "Public read theo channel"
on public.theo_channel_messages
for select
to anon, authenticated
using (true);

grant select on public.theo_channel_messages to anon, authenticated;

comment on table public.theo_channel_messages is
  'Windows/Mac Theo handoff thread. Writes are service_role only. Page: /theo on lvslotpro.com.';
