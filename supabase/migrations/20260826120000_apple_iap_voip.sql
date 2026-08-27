-- Apple IAP billing columns + VoIP push channel on APNs tokens.

alter table public.user_subscriptions
  add column if not exists billing_provider text not null default 'stripe'
    check (billing_provider in ('stripe', 'apple')),
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_product_id text;

create unique index if not exists user_subscriptions_apple_original_tx_uidx
  on public.user_subscriptions (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

comment on column public.user_subscriptions.billing_provider is
  'stripe = Stripe Checkout / webhooks; apple = StoreKit IAP verified by apple-iap-verify Edge.';

alter table public.apns_device_tokens
  add column if not exists push_channel text not null default 'alert'
    check (push_channel in ('alert', 'voip'));

-- token_key is a UNIQUE *constraint*, so `drop index` cannot remove it.
-- Dropping the constraint also drops its backing index.
alter table public.apns_device_tokens
  drop constraint if exists apns_device_tokens_token_key;

drop index if exists apns_device_tokens_token_key;

create unique index if not exists apns_device_tokens_token_channel_uidx
  on public.apns_device_tokens (token, push_channel);

create or replace function public.upsert_my_apns_device_token(
  p_token text,
  p_environment text default 'sandbox',
  p_bundle_id text default 'com.edgetilt.app',
  p_user_agent text default null,
  p_push_channel text default 'alert'
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
  channel text;
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

  channel := lower(trim(coalesce(p_push_channel, 'alert')));
  if channel not in ('alert', 'voip') then
    channel := 'alert';
  end if;

  delete from public.apns_device_tokens
  where token = tok
    and push_channel = channel;

  insert into public.apns_device_tokens (
    user_id,
    token,
    environment,
    bundle_id,
    user_agent,
    push_channel
  )
  values (
    uid,
    tok,
    env,
    bundle,
    p_user_agent,
    channel
  )
  returning id into rid;

  return rid;
end;
$$;

comment on column public.apns_device_tokens.push_channel is
  'alert = standard APNs banners; voip = PushKit token for CallKit background ring.';
