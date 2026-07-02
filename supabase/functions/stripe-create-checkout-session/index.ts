import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import {
  checkoutReturnUrls,
  requireStripeSecretKey,
  stripeFoundingMonthlyCouponId,
  stripeFoundingOnceCouponId,
  stripePriceSecretForProduct,
} from '../_shared/billingEnv.ts'
import {
  assertActiveProduct,
  createBillingAdmin,
  getUserFromJwt,
  upsertUserSubscriptionFromStripe,
} from '../_shared/billingDb.ts'

const LIFETIME_PRODUCT_SLUG = 'slots-edge-lifetime'
const STARTER_PRODUCT_SLUG = 'slots-edge-starter'
const FULL_PRODUCT_SLUG = 'slots-edge'

function foundingCouponId(
  productSlug: string,
  priceInterval: 'monthly' | 'annual',
  isLifetime: boolean,
  wantsFounding: boolean,
): string | null {
  if (!wantsFounding) return null
  if (isLifetime || priceInterval === 'annual') {
    return stripeFoundingOnceCouponId()
  }
  if (
    priceInterval === 'monthly' &&
    (productSlug === 'slots-edge' || productSlug === 'slots-edge-starter')
  ) {
    return stripeFoundingMonthlyCouponId()
  }
  return null
}

async function userHasActiveProduct(
  admin: ReturnType<typeof createBillingAdmin>,
  userId: string,
  productSlug: string,
) {
  const { data, error } = await admin
    .from('user_subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('product_slug', productSlug)
    .maybeSingle()
  if (error) throw new Error(`user_subscriptions lookup: ${error.message}`)
  return data?.status === 'active' || data?.status === 'trialing'
}

async function getActiveStarterSubscription(
  admin: ReturnType<typeof createBillingAdmin>,
  userId: string,
) {
  const { data, error } = await admin
    .from('user_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .eq('product_slug', STARTER_PRODUCT_SLUG)
    .maybeSingle()
  if (error) throw new Error(`user_subscriptions starter lookup: ${error.message}`)
  if (!data?.stripe_subscription_id) return null
  if (data.status !== 'active' && data.status !== 'trialing') return null
  return data
}

async function upgradeStarterSubscriptionToFull(
  stripe: Stripe,
  admin: ReturnType<typeof createBillingAdmin>,
  args: {
    userId: string
    starterSubscriptionId: string
    fullPriceId: string
    priceInterval: 'monthly' | 'annual'
    couponId: string | null
  },
) {
  const subscription = await stripe.subscriptions.retrieve(args.starterSubscriptionId)
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    throw new Error('Starter subscription is not active.')
  }

  const itemId = subscription.items.data[0]?.id
  if (!itemId) throw new Error('Starter subscription has no billable item.')

  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [{ id: itemId, price: args.fullPriceId }],
    proration_behavior: 'always_invoice',
    metadata: {
      supabase_user_id: args.userId,
      product_slug: FULL_PRODUCT_SLUG,
      price_interval: args.priceInterval,
      upgraded_from: STARTER_PRODUCT_SLUG,
    },
  }

  if (args.couponId) {
    updateParams.discounts = [{ coupon: args.couponId }]
  }

  const updated = await stripe.subscriptions.update(args.starterSubscriptionId, updateParams)

  await upsertUserSubscriptionFromStripe(admin, {
    userId: args.userId,
    productSlug: FULL_PRODUCT_SLUG,
    subscription: updated,
  })

  return updated
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

    const isLifetime = productSlug === LIFETIME_PRODUCT_SLUG

    const rawInterval = String(body.price_interval ?? 'monthly').trim().toLowerCase()
    const priceInterval = rawInterval === 'annual' ? 'annual' : 'monthly'
    if (
      !isLifetime &&
      priceInterval === 'annual' &&
      productSlug !== 'slots-edge' &&
      productSlug !== 'slots-edge-starter'
    ) {
      return jsonResponse({ error: 'Annual billing is only available for Slots Edge and Slots Edge Pro.' }, 400)
    }

    const productCheck = await assertActiveProduct(admin, productSlug)
    if (!productCheck.ok) {
      return jsonResponse({ error: productCheck.error }, productCheck.status)
    }

    if (isLifetime && (await userHasActiveProduct(admin, auth.user.id, LIFETIME_PRODUCT_SLUG))) {
      return jsonResponse({ error: 'You already have Slots Edge Lifetime on this account.' }, 400)
    }

    if (!isLifetime && productSlug === FULL_PRODUCT_SLUG) {
      if (await userHasActiveProduct(admin, auth.user.id, FULL_PRODUCT_SLUG)) {
        return jsonResponse({ error: 'You already have Slots Edge Pro on this account.' }, 400)
      }
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
    const wantsFounding = body.apply_early_bird !== false

    if (
      !isLifetime &&
      productSlug === FULL_PRODUCT_SLUG &&
      (await userHasActiveProduct(admin, auth.user.id, STARTER_PRODUCT_SLUG))
    ) {
      const starterRow = await getActiveStarterSubscription(admin, auth.user.id)
      if (starterRow?.stripe_subscription_id) {
        const couponId = foundingCouponId(productSlug, priceInterval, false, wantsFounding)
        await upgradeStarterSubscriptionToFull(stripe, admin, {
          userId: auth.user.id,
          starterSubscriptionId: starterRow.stripe_subscription_id,
          fullPriceId: priceId,
          priceInterval,
          couponId,
        })
        return jsonResponse({
          url: success_url,
          product_slug: productSlug,
          upgraded: true,
        })
      }
    }

    if (isLifetime) {
      const couponId = foundingCouponId(productSlug, 'monthly', true, wantsFounding)
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url,
        cancel_url,
        client_reference_id: auth.user.id,
        metadata: {
          supabase_user_id: auth.user.id,
          product_slug: productSlug,
        },
        payment_intent_data: {
          metadata: {
            supabase_user_id: auth.user.id,
            product_slug: productSlug,
          },
        },
      }
      if (couponId) {
        sessionParams.discounts = [{ coupon: couponId }]
      }

      const session = await stripe.checkout.sessions.create(sessionParams)

      if (!session.url) {
        throw new Error('Stripe Checkout session missing url.')
      }

      return jsonResponse({ url: session.url, product_slug: productSlug })
    }

    const couponId = foundingCouponId(productSlug, priceInterval, false, wantsFounding)

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

    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }]
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
