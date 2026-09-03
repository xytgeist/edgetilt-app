-- Creator-owned promo codes for fan subscriptions.
-- Policy: creator eats the discount; platform takes application_fee_percent (30%) of final price.

create table if not exists public.creator_fan_promo_codes (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent', 'amount')),
  percent_off numeric(5, 2),
  amount_off_cents integer,
  duration text not null check (duration in ('once', 'forever', 'repeating')),
  duration_in_months integer,
  max_redemptions integer,
  expires_at timestamptz,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_fan_promo_codes_code_format check (
    code ~ '^[A-Z0-9_-]{3,32}$'
  ),
  constraint creator_fan_promo_codes_discount_shape check (
    (
      discount_type = 'percent'
      and percent_off is not null
      and percent_off >= 1
      and percent_off <= 100
      and amount_off_cents is null
    )
    or (
      discount_type = 'amount'
      and amount_off_cents is not null
      and amount_off_cents >= 50
      and percent_off is null
    )
  ),
  constraint creator_fan_promo_codes_duration_shape check (
    (
      duration in ('once', 'forever')
      and duration_in_months is null
    )
    or (
      duration = 'repeating'
      and duration_in_months is not null
      and duration_in_months >= 1
      and duration_in_months <= 36
    )
  ),
  constraint creator_fan_promo_codes_max_redemptions_ok check (
    max_redemptions is null or max_redemptions >= 1
  )
);

create unique index if not exists creator_fan_promo_codes_creator_code_uidx
  on public.creator_fan_promo_codes (creator_user_id, code);

create index if not exists creator_fan_promo_codes_creator_active_idx
  on public.creator_fan_promo_codes (creator_user_id, active)
  where active = true;

comment on table public.creator_fan_promo_codes is
  'Creator self-serve fan-sub promo codes. Discount comes out of creator share; platform fee is % of final paid amount.';

alter table public.creator_fan_promo_codes enable row level security;

drop policy if exists creator_fan_promo_codes_select_own on public.creator_fan_promo_codes;
create policy creator_fan_promo_codes_select_own
  on public.creator_fan_promo_codes
  for select
  to authenticated
  using (creator_user_id = auth.uid());

drop policy if exists creator_fan_promo_codes_update_own on public.creator_fan_promo_codes;
create policy creator_fan_promo_codes_update_own
  on public.creator_fan_promo_codes
  for update
  to authenticated
  using (creator_user_id = auth.uid())
  with check (creator_user_id = auth.uid());

-- Inserts go through Edge (service role) after Stripe objects exist.
revoke insert, delete on public.creator_fan_promo_codes from authenticated;
grant select, update on public.creator_fan_promo_codes to authenticated;
grant all on public.creator_fan_promo_codes to service_role;

create or replace function public.creator_fan_promo_codes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_creator_fan_promo_codes_updated_at on public.creator_fan_promo_codes;
create trigger trg_creator_fan_promo_codes_updated_at
  before update on public.creator_fan_promo_codes
  for each row
  execute function public.creator_fan_promo_codes_set_updated_at();
