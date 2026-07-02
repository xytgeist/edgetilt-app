import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import {
  checkoutReturnUrls,
  requireStripeSecretKey,
  stripeEarlyBirdCouponId,
  stripePriceSecretForProduct,
} from '../_shared/billingEnv.ts'
import {
  assertActiveProduct,
  createBillingAdmin,
  getUserFromJwt,
} from '../_shared/billingDb.ts'

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

    let body: { product_slug?: string; price_interval?: string; apply_early_bird?: boolean } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const productSlug = String(body.product_slug ?? '').trim()
    if (!productSlug) {
      return jsonResponse({ error: 'product_slug is required.' }, 400)
    }

    const rawInterval = String(body.price_interval ?? 'monthly').trim().toLowerCase()
    const priceInterval = rawInterval === 'annual' ? 'annual' : 'monthly'
    if (productSlug !== 'slots-edge' && priceInterval === 'annual') {
      return jsonResponse({ error: 'Annual billing is only available for Full Edge (slots-edge).' }, 400)
    }

    const productCheck = await assertActiveProduct(admin, productSlug)
    if (!productCheck.ok) {
      return jsonResponse({ error: productCheck.error }, productCheck.status)
    }

    const priceId = stripePriceSecretForProduct(productSlug, priceInterval)
    const stripe = new Stripe(requireStripeSecretKey())

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (profileErr) throw new Error(profileErr.message)

    let customerId = profile?.stripe_customer_id?.trim() || null
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { supabase_user_id: auth.user.id },
      })
      customerId = customer.id
      const { error: custErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', auth.user.id)
      if (custErr) throw new Error(`profiles.stripe_customer_id update: ${custErr.message}`)
    }

    const { success_url, cancel_url } = checkoutReturnUrls(req, productSlug)
    const wantsEarlyBird = body.apply_early_bird !== false
    // Annual Full Edge is already discounted vs monthly; do not stack founding-member coupon.
    const applyEarlyBird = wantsEarlyBird && priceInterval !== 'annual'
    const earlyBirdCouponId = applyEarlyBird ? stripeEarlyBirdCouponId() : null

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      client_reference_id: auth.user.id,
      subscription_data: {
        metadata: {
          supabase_user_id: auth.user.id,
          product_slug: productSlug,
          price_interval: priceInterval,
        },
      },
      metadata: {
        supabase_user_id: auth.user.id,
        product_slug: productSlug,
        price_interval: priceInterval,
      },
    }

    if (earlyBirdCouponId) {
      sessionParams.discounts = [{ coupon: earlyBirdCouponId }]
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    if (!session.url) {
      throw new Error('Stripe Checkout session missing url.')
    }

    return jsonResponse({ url: session.url, product_slug: productSlug })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
