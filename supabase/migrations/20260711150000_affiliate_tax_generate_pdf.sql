-- Affiliate tax: FTIN-not-required flag + typed signature fields for generated W-9/W-8 PDF.
-- Test only until Ryan promotes.

alter table public.affiliate_tax_profiles
  add column if not exists ftin_not_legally_required boolean not null default false;

alter table public.affiliate_tax_profiles
  add column if not exists signature_name text;

comment on column public.affiliate_tax_profiles.ftin_not_legally_required is
  'When true, affiliate attested that a foreign TIN is not legally required (W-8 path).';
comment on column public.affiliate_tax_profiles.signature_name is
  'Typed legal name used as electronic signature on generated tax attestation PDF.';

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
        'ftin_not_legally_required', coalesce(v_tax.ftin_not_legally_required, false),
        'signature_name', v_tax.signature_name,
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
  v_ftin_not_required boolean := coalesce((p_payload->>'ftin_not_legally_required')::boolean, false);
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

  if nullif(trim(coalesce(p_payload->>'legal_name', '')), '') is null then
    raise exception 'legal_name required';
  end if;

  if nullif(trim(coalesce(p_payload->>'signature_name', '')), '') is null then
    raise exception 'signature_name required';
  end if;

  if coalesce((p_payload->>'certified')::boolean, false) is not true then
    raise exception 'certification required';
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
    ftin_not_legally_required,
    signature_name,
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
    v_ftin_not_required,
    nullif(trim(coalesce(p_payload->>'signature_name', '')), ''),
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
    ftin_not_legally_required = excluded.ftin_not_legally_required,
    signature_name = excluded.signature_name,
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
