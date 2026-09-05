-- Apple IAP dual-path: entitlements expose billing_provider, fan subs can be Apple-billed,
-- short-lived purchase intents bind a fan tier to a creator (stops $4.99 → $249 attach).

alter table public.creator_subscriptions
  add column if not exists billing_provider text not null default 'stripe';

alter table public.creator_subscriptions
  drop constraint if exists creator_subscriptions_billing_provider_check;

alter table public.creator_subscriptions
  add constraint creator_subscriptions_billing_provider_check
  check (billing_provider in ('stripe', 'apple'));

alter table public.creator_subscriptions
  add column if not exists apple_original_transaction_id text;

alter table public.creator_subscriptions
  add column if not exists apple_product_id text;

create unique index if not exists creator_subscriptions_apple_original_tx_uidx
  on public.creator_subscriptions (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

comment on column public.creator_subscriptions.billing_provider is
  'stripe = Connect Checkout; apple = StoreKit. Same chat membership either way.';

create table if not exists public.apple_iap_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  kind text not null check (kind in ('platform', 'creator_fan')),
  product_slug text,
  creator_user_id uuid,
  fan_tier_key text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists apple_iap_intents_open_idx
  on public.apple_iap_intents (user_id, product_id, created_at desc)
  where consumed_at is null;

alter table public.apple_iap_intents enable row level security;

revoke all on table public.apple_iap_intents from public, anon, authenticated;
grant all on table public.apple_iap_intents to service_role;

create or replace function public.get_my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_object_agg(
        us.product_slug,
        jsonb_build_object(
          'active', true,
          'status', us.status,
          'current_period_end', us.current_period_end,
          'cancel_at_period_end', us.cancel_at_period_end,
          'price_interval', us.price_interval,
          'billing_provider', us.billing_provider
        )
      )
      from public.user_subscriptions us
      where us.user_id = auth.uid()
        and us.status in ('active', 'trialing')
        and (us.current_period_end is null or us.current_period_end > now())
    ),
    '{}'::jsonb
  ) || jsonb_build_object(
    'platform', jsonb_build_object(
      'edge_pro', exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.product_slug in ('edge-pro', 'slots-edge-lifetime')
          and us.status in ('active', 'trialing')
          and (us.current_period_end is null or us.current_period_end > now())
      ),
      'slots_edge_tier', coalesce(
        (
          select case
            when exists (
              select 1 from public.user_subscriptions
              where user_id = auth.uid()
                and product_slug = 'slots-edge-lifetime'
                and status in ('active', 'trialing')
            ) then 'lifetime'
            when exists (
              select 1 from public.user_subscriptions
              where user_id = auth.uid()
                and product_slug = 'slots-edge'
                and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now())
            ) then 'pro'
            when exists (
              select 1 from public.user_subscriptions
              where user_id = auth.uid()
                and product_slug = 'slots-edge-starter'
                and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now())
            ) then 'starter'
            else 'none'
          end
        ),
        'none'
      ),
      'has_active_subscription', exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.status in ('active', 'trialing')
          and us.product_slug in ('slots-edge', 'slots-edge-lifetime', 'edge-pro')
          and (us.current_period_end is null or us.current_period_end > now())
      )
    ),
    'staff', jsonb_build_object(
      'is_staff', exists (
        select 1 from public.profiles pr
        where pr.user_id = auth.uid()
          and pr.role in ('admin', 'moderator')
      ),
      'is_admin', exists (
        select 1 from public.profiles pr
        where pr.user_id = auth.uid()
          and pr.role = 'admin'
      )
    )
  );
$$;

revoke all on function public.get_my_entitlements() from public;
grant execute on function public.get_my_entitlements() to authenticated, anon, service_role;

create or replace function public.get_my_creator_fan_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_object_agg(
        'creator-fan:' || cs.creator_user_id::text,
        jsonb_build_object(
          'active', true,
          'status', cs.status,
          'current_period_end', cs.current_period_end,
          'cancel_at_period_end', cs.cancel_at_period_end,
          'fan_tier_key', cs.fan_tier_key,
          'creator_user_id', cs.creator_user_id,
          'billing_provider', coalesce(cs.billing_provider, 'stripe')
        )
      )
      from public.creator_subscriptions cs
      where cs.subscriber_user_id = auth.uid()
        and cs.status in ('active', 'trialing')
        and (cs.current_period_end is null or cs.current_period_end > now())
    ),
    '{}'::jsonb
  );
$$;

grant execute on function public.get_my_creator_fan_entitlements() to authenticated;
