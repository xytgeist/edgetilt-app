/**
 * Creator fan-sub promo codes (Stripe Coupon + Promotion Code).
 * Actions: list | create | deactivate
 * Policy: creator eats discount; platform application_fee_percent applies to final price.
 */
import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'

const MAX_ACTIVE_CODES = 20

function normalizeCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function parseExpiresAt(raw: unknown): Date | null {
  if (raw == null || raw === '') return null
  const d = new Date(String(raw))
  if (Number.isNaN(d.getTime())) return null
  return d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: billingCorsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const admin = createBillingAdmin()
    const auth = await getUserFromJwt(admin, req)
    if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status)

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const action = String(body.action || 'list').trim().toLowerCase()
    const uid = auth.user.id

    const { data: monetization, error: monErr } = await admin
      .from('creator_monetization_profiles')
      .select('enabled, connect_onboarding_complete, stripe_connect_account_id')
      .eq('user_id', uid)
      .maybeSingle()
    if (monErr) throw new Error(monErr.message)
    if (!monetization?.connect_onboarding_complete || !monetization.stripe_connect_account_id) {
      return jsonResponse({ error: 'Finish Stripe Connect before creating promo codes.' }, 400)
    }

    if (action === 'list') {
      const { data, error } = await admin
        .from('creator_fan_promo_codes')
        .select(
          'id, code, discount_type, percent_off, amount_off_cents, duration, duration_in_months, max_redemptions, expires_at, active, created_at, stripe_promotion_code_id',
        )
        .eq('creator_user_id', uid)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return jsonResponse({ ok: true, codes: data || [] })
    }

    if (action === 'deactivate') {
      const id = String(body.id || '').trim()
      if (!id) return jsonResponse({ error: 'id required.' }, 400)
      const { data: row, error: findErr } = await admin
        .from('creator_fan_promo_codes')
        .select('id, stripe_promotion_code_id, active')
        .eq('id', id)
        .eq('creator_user_id', uid)
        .maybeSingle()
      if (findErr) throw new Error(findErr.message)
      if (!row) return jsonResponse({ error: 'Promo code not found.' }, 404)

      const stripe = new Stripe(requireStripeSecretKey())
      if (row.stripe_promotion_code_id) {
        try {
          await stripe.promotionCodes.update(String(row.stripe_promotion_code_id), { active: false })
        } catch (e) {
          console.error('stripe.promotionCodes.update', e)
        }
      }

      const { data: updated, error: updErr } = await admin
        .from('creator_fan_promo_codes')
        .update({ active: false })
        .eq('id', id)
        .eq('creator_user_id', uid)
        .select(
          'id, code, discount_type, percent_off, amount_off_cents, duration, duration_in_months, max_redemptions, expires_at, active, created_at',
        )
        .single()
      if (updErr) throw new Error(updErr.message)
      return jsonResponse({ ok: true, code: updated })
    }

    if (action !== 'create') {
      return jsonResponse({ error: 'Unknown action. Use list, create, or deactivate.' }, 400)
    }

    const code = normalizeCode(body.code)
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      return jsonResponse({ error: 'Code must be 3-32 chars: A-Z, 0-9, _ or -.' }, 400)
    }

    const discountType = String(body.discount_type || '').trim().toLowerCase()
    if (discountType !== 'percent' && discountType !== 'amount') {
      return jsonResponse({ error: 'discount_type must be percent or amount.' }, 400)
    }

    let percentOff: number | null = null
    let amountOffCents: number | null = null
    if (discountType === 'percent') {
      percentOff = Number(body.percent_off)
      if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) {
        return jsonResponse({ error: 'percent_off must be 1-100.' }, 400)
      }
      percentOff = Math.round(percentOff * 100) / 100
    } else {
      amountOffCents = Math.round(Number(body.amount_off_cents))
      if (!Number.isFinite(amountOffCents) || amountOffCents < 50) {
        return jsonResponse({ error: 'amount_off_cents must be at least 50 ($0.50).' }, 400)
      }
    }

    const duration = String(body.duration || 'once').trim().toLowerCase()
    if (!['once', 'forever', 'repeating'].includes(duration)) {
      return jsonResponse({ error: 'duration must be once, forever, or repeating.' }, 400)
    }
    let durationInMonths: number | null = null
    if (duration === 'repeating') {
      durationInMonths = Math.round(Number(body.duration_in_months))
      if (!Number.isFinite(durationInMonths) || durationInMonths < 1 || durationInMonths > 36) {
        return jsonResponse({ error: 'duration_in_months must be 1-36 for repeating.' }, 400)
      }
    }

    let maxRedemptions: number | null = null
    if (body.max_redemptions != null && body.max_redemptions !== '') {
      maxRedemptions = Math.round(Number(body.max_redemptions))
      if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1) {
        return jsonResponse({ error: 'max_redemptions must be >= 1.' }, 400)
      }
    }

    const expiresAt = parseExpiresAt(body.expires_at)
    if (body.expires_at && !expiresAt) {
      return jsonResponse({ error: 'Invalid expires_at.' }, 400)
    }
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return jsonResponse({ error: 'expires_at must be in the future.' }, 400)
    }

    const { count: activeCount, error: countErr } = await admin
      .from('creator_fan_promo_codes')
      .select('id', { count: 'exact', head: true })
      .eq('creator_user_id', uid)
      .eq('active', true)
    if (countErr) throw new Error(countErr.message)
    if ((activeCount || 0) >= MAX_ACTIVE_CODES) {
      return jsonResponse({ error: `Limit is ${MAX_ACTIVE_CODES} active promo codes.` }, 400)
    }

    const { data: existing } = await admin
      .from('creator_fan_promo_codes')
      .select('id')
      .eq('creator_user_id', uid)
      .eq('code', code)
      .maybeSingle()
    if (existing?.id) {
      return jsonResponse({ error: 'You already have this code.' }, 409)
    }

    const stripe = new Stripe(requireStripeSecretKey())
    const couponParams: Stripe.CouponCreateParams = {
      duration: duration as Stripe.CouponCreateParams.Duration,
      name: `Fan ${code}`,
      metadata: {
        purpose: 'creator_fan_promo',
        creator_user_id: uid,
        code,
      },
    }
    if (discountType === 'percent') {
      couponParams.percent_off = percentOff!
    } else {
      couponParams.amount_off = amountOffCents!
      couponParams.currency = 'usd'
    }
    if (duration === 'repeating' && durationInMonths) {
      couponParams.duration_in_months = durationInMonths
    }

    const coupon = await stripe.coupons.create(couponParams)
    // stripe-node v17+: promotionCodes.create uses `promotion`, not top-level `coupon`.
    const promoParams: Stripe.PromotionCodeCreateParams = {
      promotion: { type: 'coupon', coupon: coupon.id },
      code,
      metadata: {
        purpose: 'creator_fan_promo',
        creator_user_id: uid,
      },
    }
    if (maxRedemptions != null) promoParams.max_redemptions = maxRedemptions
    if (expiresAt) promoParams.expires_at = Math.floor(expiresAt.getTime() / 1000)

    let promo: Stripe.PromotionCode
    try {
      promo = await stripe.promotionCodes.create(promoParams)
    } catch (e) {
      try {
        await stripe.coupons.del(coupon.id)
      } catch {
        // best-effort
      }
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ error: msg || 'Could not create Stripe promotion code.' }, 400)
    }

    const { data: inserted, error: insErr } = await admin
      .from('creator_fan_promo_codes')
      .insert({
        creator_user_id: uid,
        code,
        discount_type: discountType,
        percent_off: percentOff,
        amount_off_cents: amountOffCents,
        duration,
        duration_in_months: durationInMonths,
        max_redemptions: maxRedemptions,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promo.id,
        active: true,
      })
      .select(
        'id, code, discount_type, percent_off, amount_off_cents, duration, duration_in_months, max_redemptions, expires_at, active, created_at',
      )
      .single()

    if (insErr) {
      try {
        await stripe.promotionCodes.update(promo.id, { active: false })
        await stripe.coupons.del(coupon.id)
      } catch {
        // best-effort
      }
      throw new Error(insErr.message)
    }

    return jsonResponse({ ok: true, code: inserted })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
