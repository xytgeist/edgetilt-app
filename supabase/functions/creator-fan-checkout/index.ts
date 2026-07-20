/**
 * Stripe Checkout for creator fan subs (Connect destination charge, 30% platform fee).
 */
import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'
import {
  CREATOR_FAN_BILLING_KIND,
  CREATOR_FAN_PLATFORM_FEE_PERCENT,
  isCreatorFanTierKey,
  stripePriceSecretForFanTier,
} from '../_shared/fanSubTiers.ts'

function checkoutReturnUrls(req: Request, creatorUserId: string) {
  const origin =
    req.headers.get('origin')?.trim() ||
    Deno.env.get('STRIPE_CHECKOUT_DEFAULT_ORIGIN')?.trim() ||
    'http://localhost:5173'
  const base = origin.replace(/\/+$/, '')
  const q = encodeURIComponent(creatorUserId)
  return {
    success_url: `${base}/?billing=fan_success&creator=${q}`,
    cancel_url: `${base}/?billing=fan_cancel&creator=${q}`,
  }
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

    let body: { creator_user_id?: string } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const creatorUserId = String(body.creator_user_id || '').trim()
    if (!creatorUserId) {
      return jsonResponse({ error: 'creator_user_id required.' }, 400)
    }
    if (creatorUserId === auth.user.id) {
      return jsonResponse({ error: 'You cannot subscribe to yourself.' }, 400)
    }

    const { data: offer, error: offerErr } = await admin.rpc('get_creator_fan_offer', {
      p_creator_user_id: creatorUserId,
    })
    if (offerErr) throw new Error(offerErr.message)
    if (!offer || typeof offer !== 'object' || offer.enabled !== true) {
      return jsonResponse({ error: 'This creator is not accepting fan subscriptions yet.' }, 400)
    }

    const tierKey = String(offer.fan_tier_key || '').trim()
    if (!isCreatorFanTierKey(tierKey)) {
      return jsonResponse({ error: 'Creator fan tier misconfigured.' }, 500)
    }

    const { data: monetization, error: monErr } = await admin
      .from('creator_monetization_profiles')
      .select('stripe_connect_account_id, connect_onboarding_complete')
      .eq('user_id', creatorUserId)
      .maybeSingle()
    if (monErr) throw new Error(monErr.message)
    const destination = monetization?.stripe_connect_account_id?.trim()
    if (!destination || !monetization?.connect_onboarding_complete) {
      return jsonResponse({ error: 'Creator payouts are not ready yet.' }, 400)
    }

    const priceId = stripePriceSecretForFanTier(tierKey)
    const stripe = new Stripe(requireStripeSecretKey())

    const { data: subProfile, error: subProfErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (subProfErr) throw new Error(subProfErr.message)

    let customerId = subProfile?.stripe_customer_id?.trim() || null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email || undefined,
        metadata: { supabase_user_id: auth.user.id },
      })
      customerId = customer.id
      const { error: custErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', auth.user.id)
      if (custErr) throw new Error(`profiles.stripe_customer_id update: ${custErr.message}`)
    }

    const meta = {
      billing_kind: CREATOR_FAN_BILLING_KIND,
      creator_user_id: creatorUserId,
      subscriber_user_id: auth.user.id,
      fan_tier_key: tierKey,
      product_slug: `creator-fan:${creatorUserId}`,
    }

    const { success_url, cancel_url } = checkoutReturnUrls(req, creatorUserId)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: auth.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: meta,
      subscription_data: {
        application_fee_percent: CREATOR_FAN_PLATFORM_FEE_PERCENT,
        transfer_data: { destination },
        metadata: meta,
      },
    })

    if (!session.url) {
      return jsonResponse({ error: 'Checkout URL missing.' }, 500)
    }

    return jsonResponse({ url: session.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
