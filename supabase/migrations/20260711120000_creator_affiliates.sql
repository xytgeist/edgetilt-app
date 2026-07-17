-- Creator affiliates: packages, affiliates, attributions, commissions, tax profiles.
-- Admin: play_log_viewer_is_admin(). Creators: own row via user_id. Public: resolve_affiliate_ref only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.affiliate_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  commission_pct_monthly numeric(5, 2) not null
    check (commission_pct_monthly >= 0 and commission_pct_monthly <= 100),
  commission_pct_one_time numeric(5, 2) not null
    check (commission_pct_one_time >= 0 and commission_pct_one_time <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.affiliate_packages (slug, display_name, commission_pct_monthly, commission_pct_one_time)
values
  ('creator', 'Creator', 20, 20),
  ('mid', 'Mid', 25, 25),
  ('elite', 'Elite', 30, 30)
on conflict (slug) do update set
  display_name = excluded.display_name,
  commission_pct_monthly = excluded.commission_pct_monthly,
  commission_pct_one_time = excluded.commission_pct_one_time,
  active = true,
  updated_at = now();

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  promo_code text,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  package_id uuid not null references public.affiliate_packages (id),
  display_name text not null,
  contact_email text,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'disabled')),
  payout_notes text,
  stripe_connect_account_id text,
  connect_onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliates_code_normalized check (code = lower(trim(code))),
  constraint affiliates_code_format check (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);

create unique index if not exists affiliates_code_uidx on public.affiliates (code);
create unique index if not exists affiliates_promo_code_uidx
  on public.affiliates (lower(promo_code))
  where promo_code is not null and length(trim(promo_code)) > 0;
create unique index if not exists affiliates_user_id_uidx
  on public.affiliates (user_id)
  where user_id is not null;
create index if not exists affiliates_status_idx on public.affiliates (status);

create table if not exists public.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  visitor_key text,
  user_id uuid references auth.users (id) on delete set null,
  stripe_customer_id text,
  source text not null check (source in ('ref', 'promo')),
  attributed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_attributions_affiliate_idx
  on public.affiliate_attributions (affiliate_id);
create index if not exists affiliate_attributions_user_idx
  on public.affiliate_attributions (user_id)
  where user_id is not null;
create index if not exists affiliate_attributions_expires_idx
  on public.affiliate_attributions (expires_at);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  stripe_checkout_session_id text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  product_slug text,
  price_interval text check (
    price_interval is null
    or price_interval in ('month', 'year', 'lifetime', 'monthly', 'annual')
  ),
  gross_cents integer not null default 0 check (gross_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  net_cents integer not null check (net_cents >= 0),
  commission_pct numeric(5, 2) not null check (commission_pct >= 0 and commission_pct <= 100),
  commission_cents integer not null check (commission_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'payable', 'paid', 'void')),
  payable_at timestamptz not null,
  paid_at timestamptz,
  payout_ref text,
  void_reason text,
  clawback_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_commissions_has_stripe_identity check (
    stripe_checkout_session_id is not null
    or stripe_invoice_id is not null
    or stripe_payment_intent_id is not null
  )
);

create unique index if not exists affiliate_commissions_invoice_uidx
  on public.affiliate_commissions (stripe_invoice_id)
  where stripe_invoice_id is not null;
create unique index if not exists affiliate_commissions_session_uidx
  on public.affiliate_commissions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null
    and stripe_invoice_id is null;
create unique index if not exists affiliate_commissions_pi_uidx
  on public.affiliate_commissions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null
    and stripe_invoice_id is null
    and stripe_checkout_session_id is null;
create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions (affiliate_id, status);
create index if not exists affiliate_commissions_payable_at_idx
  on public.affiliate_commissions (payable_at)
  where status = 'pending';

create table if not exists public.affiliate_tax_profiles (
  affiliate_id uuid primary key references public.affiliates (id) on delete cascade,
  form_type text not null default 'w9' check (form_type in ('w9', 'w8')),
  legal_name text,
  business_name text,
  tax_classification text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text not null default 'US',
  tin_last4 text,
  foreign_tax_id text,
  document_path text,
  attested_at timestamptz,
  attested_by_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'submitted', 'reviewed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Config helpers
-- ---------------------------------------------------------------------------

create or replace function public.affiliate_hold_days()
returns integer
language sql
immutable
as $$
  select 45;
$$;

create or replace function public.affiliate_attribution_days()
returns integer
language sql
immutable
as $$
  select 30;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.affiliate_packages enable row level security;
alter table public.affiliates enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_tax_profiles enable row level security;

drop policy if exists affiliate_packages_admin_all on public.affiliate_packages;
create policy affiliate_packages_admin_all on public.affiliate_packages
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

drop policy if exists affiliate_packages_authenticated_read on public.affiliate_packages;
create policy affiliate_packages_authenticated_read on public.affiliate_packages
  for select to authenticated
  using (active = true);

drop policy if exists affiliates_admin_all on public.affiliates;
create policy affiliates_admin_all on public.affiliates
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

drop policy if exists affiliates_self_select on public.affiliates;
create policy affiliates_self_select on public.affiliates
  for select to authenticated
  using (user_id = auth.uid() and status = 'active');

drop policy if exists affiliate_attributions_admin_all on public.affiliate_attributions;
create policy affiliate_attributions_admin_all on public.affiliate_attributions
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

drop policy if exists affiliate_attributions_self_select on public.affiliate_attributions;
create policy affiliate_attributions_self_select on public.affiliate_attributions
  for select to authenticated
  using (
    exists (
      select 1
      from public.affiliates a
      where a.id = affiliate_id
        and a.user_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists affiliate_commissions_admin_all on public.affiliate_commissions;
create policy affiliate_commissions_admin_all on public.affiliate_commissions
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

drop policy if exists affiliate_commissions_self_select on public.affiliate_commissions;
create policy affiliate_commissions_self_select on public.affiliate_commissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.affiliates a
      where a.id = affiliate_id
        and a.user_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists affiliate_tax_profiles_admin_all on public.affiliate_tax_profiles;
create policy affiliate_tax_profiles_admin_all on public.affiliate_tax_profiles
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

drop policy if exists affiliate_tax_profiles_self_select on public.affiliate_tax_profiles;
create policy affiliate_tax_profiles_self_select on public.affiliate_tax_profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.affiliates a
      where a.id = affiliate_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists affiliate_tax_profiles_self_upsert on public.affiliate_tax_profiles;
create policy affiliate_tax_profiles_self_insert on public.affiliate_tax_profiles
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.affiliates a
      where a.id = affiliate_id
        and a.user_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists affiliate_tax_profiles_self_update on public.affiliate_tax_profiles;
create policy affiliate_tax_profiles_self_update on public.affiliate_tax_profiles
  for update to authenticated
  using (
    exists (
      select 1
      from public.affiliates a
      where a.id = affiliate_id
        and a.user_id = auth.uid()
        and a.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.affiliates a
      where a.id = affiliate_id
        and a.user_id = auth.uid()
        and a.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: private tax docs
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('affiliate-tax-docs', 'affiliate-tax-docs', false)
on conflict (id) do nothing;

drop policy if exists affiliate_tax_docs_insert_own on storage.objects;
create policy affiliate_tax_docs_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'affiliate-tax-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists affiliate_tax_docs_select_own on storage.objects;
create policy affiliate_tax_docs_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'affiliate-tax-docs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.play_log_viewer_is_admin()
  )
);

drop policy if exists affiliate_tax_docs_update_own on storage.objects;
create policy affiliate_tax_docs_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'affiliate-tax-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'affiliate-tax-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists affiliate_tax_docs_delete_own on storage.objects;
create policy affiliate_tax_docs_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'affiliate-tax-docs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.play_log_viewer_is_admin()
  )
);

-- ---------------------------------------------------------------------------
-- Public resolve
-- ---------------------------------------------------------------------------

create or replace function public.resolve_affiliate_ref(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_row record;
begin
  if v_code = '' then
    return null;
  end if;

  select a.id, a.code, a.promo_code, a.display_name
  into v_row
  from public.affiliates a
  where a.code = v_code
    and a.status = 'active'
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'affiliate_id', v_row.id,
    'code', v_row.code,
    'promo_code', v_row.promo_code,
    'display_name', v_row.display_name
  );
end;
$$;

revoke all on function public.resolve_affiliate_ref(text) from public;
grant execute on function public.resolve_affiliate_ref(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Promote pending → payable
-- ---------------------------------------------------------------------------

create or replace function public.affiliate_promote_payable_commissions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.affiliate_commissions
  set status = 'payable',
      updated_at = now()
  where status = 'pending'
    and payable_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.affiliate_promote_payable_commissions() from public;
grant execute on function public.affiliate_promote_payable_commissions() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin snapshot + upsert + mark paid
-- ---------------------------------------------------------------------------

create or replace function public.admin_affiliate_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packages jsonb;
  v_affiliates jsonb;
  v_commissions jsonb;
begin
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  perform public.affiliate_promote_payable_commissions();

  select coalesce(jsonb_agg(to_jsonb(p) order by p.commission_pct_monthly), '[]'::jsonb)
  into v_packages
  from public.affiliate_packages p;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'code', a.code,
        'promo_code', a.promo_code,
        'stripe_coupon_id', a.stripe_coupon_id,
        'stripe_promotion_code_id', a.stripe_promotion_code_id,
        'package_id', a.package_id,
        'package_slug', pkg.slug,
        'display_name', a.display_name,
        'contact_email', a.contact_email,
        'user_id', a.user_id,
        'status', a.status,
        'payout_notes', a.payout_notes,
        'stripe_connect_account_id', a.stripe_connect_account_id,
        'connect_onboarding_complete', a.connect_onboarding_complete,
        'created_at', a.created_at,
        'updated_at', a.updated_at,
        'tax_status', coalesce(t.status, 'incomplete'),
        'pending_cents', coalesce((
          select sum(c.commission_cents)::bigint
          from public.affiliate_commissions c
          where c.affiliate_id = a.id and c.status = 'pending'
        ), 0),
        'payable_cents', coalesce((
          select sum(c.commission_cents)::bigint
          from public.affiliate_commissions c
          where c.affiliate_id = a.id and c.status = 'payable'
        ), 0),
        'paid_cents', coalesce((
          select sum(c.commission_cents)::bigint
          from public.affiliate_commissions c
          where c.affiliate_id = a.id and c.status = 'paid'
        ), 0)
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_affiliates
  from public.affiliates a
  join public.affiliate_packages pkg on pkg.id = a.package_id
  left join public.affiliate_tax_profiles t on t.affiliate_id = a.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'affiliate_id', c.affiliate_id,
        'affiliate_code', a.code,
        'affiliate_name', a.display_name,
        'user_id', c.user_id,
        'stripe_checkout_session_id', c.stripe_checkout_session_id,
        'stripe_invoice_id', c.stripe_invoice_id,
        'stripe_payment_intent_id', c.stripe_payment_intent_id,
        'product_slug', c.product_slug,
        'price_interval', c.price_interval,
        'gross_cents', c.gross_cents,
        'discount_cents', c.discount_cents,
        'net_cents', c.net_cents,
        'commission_pct', c.commission_pct,
        'commission_cents', c.commission_cents,
        'status', c.status,
        'payable_at', c.payable_at,
        'paid_at', c.paid_at,
        'payout_ref', c.payout_ref,
        'void_reason', c.void_reason,
        'clawback_flag', c.clawback_flag,
        'created_at', c.created_at
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_commissions
  from public.affiliate_commissions c
  join public.affiliates a on a.id = c.affiliate_id;

  return jsonb_build_object(
    'packages', v_packages,
    'affiliates', v_affiliates,
    'commissions', v_commissions,
    'hold_days', public.affiliate_hold_days()
  );
end;
$$;

revoke all on function public.admin_affiliate_portal_snapshot() from public;
grant execute on function public.admin_affiliate_portal_snapshot() to authenticated;

create or replace function public.admin_affiliate_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(trim(coalesce(p_payload->>'id', '')), '')::uuid;
  v_code text := lower(trim(coalesce(p_payload->>'code', '')));
  v_package_id uuid;
  v_package_slug text := lower(trim(coalesce(p_payload->>'package_slug', '')));
  v_user_id uuid := nullif(trim(coalesce(p_payload->>'user_id', '')), '')::uuid;
  v_status text := coalesce(nullif(trim(p_payload->>'status'), ''), 'invited');
  v_row public.affiliates%rowtype;
begin
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  if v_code = '' then
    raise exception 'code is required';
  end if;

  if v_status not in ('invited', 'active', 'disabled') then
    raise exception 'invalid status';
  end if;

  if p_payload ? 'package_id' and nullif(trim(coalesce(p_payload->>'package_id', '')), '') is not null then
    v_package_id := (p_payload->>'package_id')::uuid;
  else
    select id into v_package_id
    from public.affiliate_packages
    where slug = v_package_slug
      and active = true
    limit 1;
  end if;

  if v_package_id is null then
    raise exception 'package_id or package_slug required';
  end if;

  if v_id is null then
    insert into public.affiliates (
      code,
      promo_code,
      stripe_coupon_id,
      stripe_promotion_code_id,
      package_id,
      display_name,
      contact_email,
      user_id,
      status,
      payout_notes
    ) values (
      v_code,
      nullif(trim(coalesce(p_payload->>'promo_code', '')), ''),
      nullif(trim(coalesce(p_payload->>'stripe_coupon_id', '')), ''),
      nullif(trim(coalesce(p_payload->>'stripe_promotion_code_id', '')), ''),
      v_package_id,
      coalesce(nullif(trim(p_payload->>'display_name'), ''), v_code),
      nullif(trim(coalesce(p_payload->>'contact_email', '')), ''),
      v_user_id,
      v_status,
      nullif(trim(coalesce(p_payload->>'payout_notes', '')), '')
    )
    returning * into v_row;
  else
    update public.affiliates a
    set
      code = v_code,
      promo_code = case
        when p_payload ? 'promo_code' then nullif(trim(coalesce(p_payload->>'promo_code', '')), '')
        else a.promo_code
      end,
      stripe_coupon_id = case
        when p_payload ? 'stripe_coupon_id' then nullif(trim(coalesce(p_payload->>'stripe_coupon_id', '')), '')
        else a.stripe_coupon_id
      end,
      stripe_promotion_code_id = case
        when p_payload ? 'stripe_promotion_code_id' then nullif(trim(coalesce(p_payload->>'stripe_promotion_code_id', '')), '')
        else a.stripe_promotion_code_id
      end,
      package_id = v_package_id,
      display_name = coalesce(nullif(trim(p_payload->>'display_name'), ''), a.display_name),
      contact_email = case
        when p_payload ? 'contact_email' then nullif(trim(coalesce(p_payload->>'contact_email', '')), '')
        else a.contact_email
      end,
      user_id = case when p_payload ? 'user_id' then v_user_id else a.user_id end,
      status = v_status,
      payout_notes = case
        when p_payload ? 'payout_notes' then nullif(trim(coalesce(p_payload->>'payout_notes', '')), '')
        else a.payout_notes
      end,
      updated_at = now()
    where a.id = v_id
    returning * into v_row;

    if not found then
      raise exception 'affiliate not found';
    end if;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_affiliate_upsert(jsonb) from public;
grant execute on function public.admin_affiliate_upsert(jsonb) to authenticated;

create or replace function public.admin_affiliate_mark_commissions_paid(
  p_commission_ids uuid[],
  p_payout_ref text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  if p_commission_ids is null or cardinality(p_commission_ids) = 0 then
    return 0;
  end if;

  update public.affiliate_commissions c
  set
    status = 'paid',
    paid_at = now(),
    payout_ref = coalesce(nullif(trim(p_payout_ref), ''), c.payout_ref),
    updated_at = now()
  where c.id = any (p_commission_ids)
    and c.status = 'payable';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_affiliate_mark_commissions_paid(uuid[], text) from public;
grant execute on function public.admin_affiliate_mark_commissions_paid(uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Creator portal
-- ---------------------------------------------------------------------------

create or replace function public.get_my_affiliate_portal()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff public.affiliates%rowtype;
  v_pkg public.affiliate_packages%rowtype;
  v_tax public.affiliate_tax_profiles%rowtype;
  v_pending bigint;
  v_payable bigint;
  v_paid bigint;
  v_ytd bigint;
  v_commissions jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  perform public.affiliate_promote_payable_commissions();

  select * into v_aff
  from public.affiliates
  where user_id = auth.uid()
    and status = 'active'
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_pkg from public.affiliate_packages where id = v_aff.package_id;
  select * into v_tax from public.affiliate_tax_profiles where affiliate_id = v_aff.id;

  select coalesce(sum(commission_cents), 0)::bigint into v_pending
  from public.affiliate_commissions
  where affiliate_id = v_aff.id and status = 'pending';

  select coalesce(sum(commission_cents), 0)::bigint into v_payable
  from public.affiliate_commissions
  where affiliate_id = v_aff.id and status = 'payable';

  select coalesce(sum(commission_cents), 0)::bigint into v_paid
  from public.affiliate_commissions
  where affiliate_id = v_aff.id and status = 'paid';

  select coalesce(sum(commission_cents), 0)::bigint into v_ytd
  from public.affiliate_commissions
  where affiliate_id = v_aff.id
    and status = 'paid'
    and paid_at >= date_trunc('year', now());

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'product_slug', c.product_slug,
        'price_interval', c.price_interval,
        'net_cents', c.net_cents,
        'commission_pct', c.commission_pct,
        'commission_cents', c.commission_cents,
        'status', c.status,
        'payable_at', c.payable_at,
        'paid_at', c.paid_at,
        'created_at', c.created_at
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_commissions
  from (
    select *
    from public.affiliate_commissions
    where affiliate_id = v_aff.id
    order by created_at desc
    limit 50
  ) c;

  return jsonb_build_object(
    'affiliate', jsonb_build_object(
      'id', v_aff.id,
      'code', v_aff.code,
      'promo_code', v_aff.promo_code,
      'display_name', v_aff.display_name,
      'status', v_aff.status,
      'package_slug', v_pkg.slug,
      'package_name', v_pkg.display_name,
      'commission_pct_monthly', v_pkg.commission_pct_monthly,
      'commission_pct_one_time', v_pkg.commission_pct_one_time,
      'stripe_connect_account_id', v_aff.stripe_connect_account_id,
      'connect_onboarding_complete', v_aff.connect_onboarding_complete,
      'payout_notes', v_aff.payout_notes
    ),
    'totals', jsonb_build_object(
      'pending_cents', v_pending,
      'payable_cents', v_payable,
      'paid_cents', v_paid,
      'ytd_paid_cents', v_ytd
    ),
    'tax', case
      when v_tax.affiliate_id is null then jsonb_build_object('status', 'incomplete')
      else jsonb_build_object(
        'form_type', v_tax.form_type,
        'legal_name', v_tax.legal_name,
        'business_name', v_tax.business_name,
        'tax_classification', v_tax.tax_classification,
        'address_line1', v_tax.address_line1,
        'address_line2', v_tax.address_line2,
        'city', v_tax.city,
        'region', v_tax.region,
        'postal_code', v_tax.postal_code,
        'country', v_tax.country,
        'tin_last4', v_tax.tin_last4,
        'foreign_tax_id', v_tax.foreign_tax_id,
        'document_path', v_tax.document_path,
        'attested_at', v_tax.attested_at,
        'status', v_tax.status
      )
    end,
    'commissions', v_commissions,
    'share_path', '/?ref=' || v_aff.code
  );
end;
$$;

revoke all on function public.get_my_affiliate_portal() from public;
grant execute on function public.get_my_affiliate_portal() to authenticated;

create or replace function public.upsert_my_affiliate_tax_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff_id uuid;
  v_form text := lower(coalesce(nullif(trim(p_payload->>'form_type'), ''), 'w9'));
  v_row public.affiliate_tax_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  select id into v_aff_id
  from public.affiliates
  where user_id = auth.uid()
    and status = 'active'
  limit 1;

  if v_aff_id is null then
    raise exception 'not an active affiliate';
  end if;

  if v_form not in ('w9', 'w8') then
    raise exception 'invalid form_type';
  end if;

  insert into public.affiliate_tax_profiles (
    affiliate_id,
    form_type,
    legal_name,
    business_name,
    tax_classification,
    address_line1,
    address_line2,
    city,
    region,
    postal_code,
    country,
    tin_last4,
    foreign_tax_id,
    document_path,
    attested_at,
    attested_by_user_id,
    status,
    updated_at
  ) values (
    v_aff_id,
    v_form,
    nullif(trim(coalesce(p_payload->>'legal_name', '')), ''),
    nullif(trim(coalesce(p_payload->>'business_name', '')), ''),
    nullif(trim(coalesce(p_payload->>'tax_classification', '')), ''),
    nullif(trim(coalesce(p_payload->>'address_line1', '')), ''),
    nullif(trim(coalesce(p_payload->>'address_line2', '')), ''),
    nullif(trim(coalesce(p_payload->>'city', '')), ''),
    nullif(trim(coalesce(p_payload->>'region', '')), ''),
    nullif(trim(coalesce(p_payload->>'postal_code', '')), ''),
    coalesce(nullif(trim(p_payload->>'country'), ''), 'US'),
    nullif(trim(coalesce(p_payload->>'tin_last4', '')), ''),
    nullif(trim(coalesce(p_payload->>'foreign_tax_id', '')), ''),
    nullif(trim(coalesce(p_payload->>'document_path', '')), ''),
    now(),
    auth.uid(),
    'submitted',
    now()
  )
  on conflict (affiliate_id) do update set
    form_type = excluded.form_type,
    legal_name = excluded.legal_name,
    business_name = excluded.business_name,
    tax_classification = excluded.tax_classification,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country = excluded.country,
    tin_last4 = excluded.tin_last4,
    foreign_tax_id = excluded.foreign_tax_id,
    document_path = coalesce(excluded.document_path, public.affiliate_tax_profiles.document_path),
    attested_at = now(),
    attested_by_user_id = auth.uid(),
    status = 'submitted',
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.upsert_my_affiliate_tax_profile(jsonb) from public;
grant execute on function public.upsert_my_affiliate_tax_profile(jsonb) to authenticated;

-- Who am I (for nav): cheap check whether current user is an active affiliate
create or replace function public.i_am_active_affiliate()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.affiliates a
    where a.user_id = auth.uid()
      and a.status = 'active'
  );
$$;

revoke all on function public.i_am_active_affiliate() from public;
grant execute on function public.i_am_active_affiliate() to authenticated;

-- Admin: set Connect account fields (used by Edge after onboarding)
create or replace function public.admin_affiliate_set_connect(
  p_affiliate_id uuid,
  p_stripe_connect_account_id text,
  p_onboarding_complete boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.play_log_viewer_is_admin()
     and not exists (
       select 1 from public.affiliates a
       where a.id = p_affiliate_id and a.user_id = auth.uid()
     )
  then
    raise exception 'not allowed';
  end if;

  update public.affiliates
  set
    stripe_connect_account_id = nullif(trim(p_stripe_connect_account_id), ''),
    connect_onboarding_complete = coalesce(p_onboarding_complete, false),
    updated_at = now()
  where id = p_affiliate_id;
end;
$$;

revoke all on function public.admin_affiliate_set_connect(uuid, text, boolean) from public;
grant execute on function public.admin_affiliate_set_connect(uuid, text, boolean) to authenticated, service_role;

comment on table public.affiliates is 'Creator affiliates; invite-only via admin.';
comment on table public.affiliate_commissions is 'Commission ledger from Stripe webhooks; hold then payable then paid/void.';
