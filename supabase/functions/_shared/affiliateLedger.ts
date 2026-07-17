import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type AffiliateRow = {
  id: string
  code: string
  promo_code: string | null
  stripe_coupon_id: string | null
  stripe_promotion_code_id: string | null
  package_id: string
  user_id: string | null
  status: string
  contact_email: string | null
}

export type AffiliatePackageRow = {
  id: string
  slug: string
  commission_pct_monthly: number
  commission_pct_one_time: number
}

const HOLD_DAYS = 45
const ATTRIBUTION_DAYS = 30

export async function loadActiveAffiliateByCode(
  admin: SupabaseClient,
  code: string,
): Promise<(AffiliateRow & { package: AffiliatePackageRow }) | null> {
  const normalized = String(code || '').trim().toLowerCase()
  if (!normalized) return null

  const { data: aff, error } = await admin
    .from('affiliates')
    .select(
      'id, code, promo_code, stripe_coupon_id, stripe_promotion_code_id, package_id, user_id, status, contact_email',
    )
    .eq('code', normalized)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`affiliates lookup: ${error.message}`)
  if (!aff) return null

  const { data: pkg, error: pkgErr } = await admin
    .from('affiliate_packages')
    .select('id, slug, commission_pct_monthly, commission_pct_one_time')
    .eq('id', aff.package_id)
    .maybeSingle()
  if (pkgErr) throw new Error(`affiliate_packages lookup: ${pkgErr.message}`)
  if (!pkg) return null

  return {
    ...(aff as AffiliateRow),
    package: pkg as AffiliatePackageRow,
  }
}

export async function loadActiveAffiliateById(
  admin: SupabaseClient,
  affiliateId: string,
): Promise<(AffiliateRow & { package: AffiliatePackageRow }) | null> {
  const id = String(affiliateId || '').trim()
  if (!id) return null

  const { data: aff, error } = await admin
    .from('affiliates')
    .select(
      'id, code, promo_code, stripe_coupon_id, stripe_promotion_code_id, package_id, user_id, status, contact_email',
    )
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`affiliates lookup: ${error.message}`)
  if (!aff) return null

  const { data: pkg, error: pkgErr } = await admin
    .from('affiliate_packages')
    .select('id, slug, commission_pct_monthly, commission_pct_one_time')
    .eq('id', aff.package_id)
    .maybeSingle()
  if (pkgErr) throw new Error(`affiliate_packages lookup: ${pkgErr.message}`)
  if (!pkg) return null

  return {
    ...(aff as AffiliateRow),
    package: pkg as AffiliatePackageRow,
  }
}

export function isSelfReferral(
  affiliate: AffiliateRow,
  buyerUserId: string,
  buyerEmail: string | null | undefined,
): boolean {
  if (affiliate.user_id && affiliate.user_id === buyerUserId) return true
  const affEmail = (affiliate.contact_email || '').trim().toLowerCase()
  const buyEmail = (buyerEmail || '').trim().toLowerCase()
  if (affEmail && buyEmail && affEmail === buyEmail) return true
  return false
}

export async function upsertCheckoutAttribution(
  admin: SupabaseClient,
  args: {
    affiliateId: string
    userId: string
    stripeCustomerId: string | null
    source: 'ref' | 'promo'
  },
) {
  const expiresAt = new Date(Date.now() + ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await admin
    .from('affiliate_attributions')
    .select('id, expires_at')
    .eq('affiliate_id', args.affiliateId)
    .eq('user_id', args.userId)
    .order('attributed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const stillValid = existing.expires_at && new Date(existing.expires_at).getTime() > Date.now()
    if (stillValid) {
      await admin
        .from('affiliate_attributions')
        .update({
          stripe_customer_id: args.stripeCustomerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      return
    }
  }

  const { error } = await admin.from('affiliate_attributions').insert({
    affiliate_id: args.affiliateId,
    user_id: args.userId,
    stripe_customer_id: args.stripeCustomerId,
    source: args.source,
    expires_at: expiresAt,
  })
  if (error) throw new Error(`affiliate_attributions insert: ${error.message}`)
}

function commissionPctForInterval(
  pkg: AffiliatePackageRow,
  priceInterval: string | null | undefined,
): number {
  const interval = String(priceInterval || '').toLowerCase()
  if (interval === 'lifetime' || interval === 'year' || interval === 'annual') {
    return Number(pkg.commission_pct_one_time)
  }
  return Number(pkg.commission_pct_monthly)
}

export async function insertAffiliateCommission(
  admin: SupabaseClient,
  args: {
    affiliateId: string
    package: AffiliatePackageRow
    userId: string | null
    stripeCheckoutSessionId?: string | null
    stripeInvoiceId?: string | null
    stripePaymentIntentId?: string | null
    stripeChargeId?: string | null
    productSlug?: string | null
    priceInterval?: string | null
    grossCents: number
    discountCents: number
    netCents: number
    paidAtMs?: number
  },
): Promise<{ inserted: boolean; id?: string }> {
  if (args.netCents <= 0) return { inserted: false }

  const pct = commissionPctForInterval(args.package, args.priceInterval)
  const commissionCents = Math.floor((args.netCents * pct) / 100)
  if (commissionCents <= 0) return { inserted: false }

  const paidAt = args.paidAtMs ? new Date(args.paidAtMs) : new Date()
  const payableAt = new Date(paidAt.getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000)

  const row = {
    affiliate_id: args.affiliateId,
    user_id: args.userId,
    stripe_checkout_session_id: args.stripeCheckoutSessionId || null,
    stripe_invoice_id: args.stripeInvoiceId || null,
    stripe_payment_intent_id: args.stripePaymentIntentId || null,
    stripe_charge_id: args.stripeChargeId || null,
    product_slug: args.productSlug || null,
    price_interval: args.priceInterval || null,
    gross_cents: Math.max(0, Math.floor(args.grossCents)),
    discount_cents: Math.max(0, Math.floor(args.discountCents)),
    net_cents: Math.max(0, Math.floor(args.netCents)),
    commission_pct: pct,
    commission_cents: commissionCents,
    status: 'pending',
    payable_at: payableAt.toISOString(),
  }

  const { data, error } = await admin
    .from('affiliate_commissions')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (error) {
    // Unique violation = already commissioned for this Stripe identity
    if (error.code === '23505') return { inserted: false }
    throw new Error(`affiliate_commissions insert: ${error.message}`)
  }

  return { inserted: true, id: data?.id }
}

export async function voidAffiliateCommissionsForRefund(
  admin: SupabaseClient,
  args: {
    stripeInvoiceId?: string | null
    stripePaymentIntentId?: string | null
    stripeChargeId?: string | null
    stripeCheckoutSessionId?: string | null
    reason: string
  },
) {
  const filters: Array<{ column: string; value: string }> = []
  if (args.stripeInvoiceId) filters.push({ column: 'stripe_invoice_id', value: args.stripeInvoiceId })
  if (args.stripePaymentIntentId) {
    filters.push({ column: 'stripe_payment_intent_id', value: args.stripePaymentIntentId })
  }
  if (args.stripeChargeId) filters.push({ column: 'stripe_charge_id', value: args.stripeChargeId })
  if (args.stripeCheckoutSessionId) {
    filters.push({ column: 'stripe_checkout_session_id', value: args.stripeCheckoutSessionId })
  }
  if (filters.length === 0) return 0

  let total = 0
  for (const f of filters) {
    const { data: rows } = await admin
      .from('affiliate_commissions')
      .select('id, status')
      .eq(f.column, f.value)

    for (const row of rows || []) {
      if (row.status === 'pending' || row.status === 'payable') {
        const { error } = await admin
          .from('affiliate_commissions')
          .update({
            status: 'void',
            void_reason: args.reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (error) throw new Error(`void commission: ${error.message}`)
        total += 1
      } else if (row.status === 'paid') {
        const { error } = await admin
          .from('affiliate_commissions')
          .update({
            clawback_flag: true,
            void_reason: args.reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (error) throw new Error(`flag clawback: ${error.message}`)
        total += 1
      }
    }
  }
  return total
}

export async function promotePayableCommissions(admin: SupabaseClient) {
  const { error } = await admin.rpc('affiliate_promote_payable_commissions')
  if (error) console.warn('affiliate_promote_payable_commissions:', error.message)
}
