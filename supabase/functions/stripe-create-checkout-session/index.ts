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
import {
  isSelfReferral,
  loadActiveAffiliateByCode,
  upsertCheckoutAttribution,
} from '../_shared/affiliateLedger.ts'

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

async function getActiveSubscriptionRow(
  admin: ReturnType<typeof createBillingAdmin>,
  userId: string,
  productSlug: string,
) {
  const { data, error } = await admin
    .from('user_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .eq('product_slug', productSlug)
    .maybeSingle()
  if (error) throw new Error(`user_subscriptions lookup (${productSlug}): ${error.message}`)
  if (!data?.stripe_subscription_id) return null
  if (data.status !== 'active' && data.status !== 'trialing') return null
  return data
}

async function getActiveStarterSubscription(
  admin: ReturnType<typeof createBillingAdmin>,
  userId: string,
) {
  return getActiveSubscriptionRow(admin, userId, STARTER_PRODUCT_SLUG)
}

/** Active Starter and/or Pro Stripe subscription ids to cancel after Lifetime checkout. */
async function getActiveRecurringStripeSubscriptionIds(
  admin: ReturnType<typeof createBillingAdmin>,
  userId: string,
) {
  const ids: string[] = []
  for (const slug of [STARTER_PRODUCT_SLUG, FULL_PRODUCT_SLUG]) {
    const row = await getActiveSubscriptionRow(admin, userId, slug)
    if (row?.stripe_subscription_id) ids.push(row.stripe_subscription_id)
  }
  return [...new Set(ids)]
}

function subscriptionPriceIntervalForProduct(
  subscription: Stripe.Subscription,
  productSlug: string,
): 'monthly' | 'annual' {
  const metaInterval = subscription.metadata?.price_interval?.trim().toLowerCase()
  if (metaInterval === 'annual') return 'annual'

  const priceId = subscription.items.data[0]?.price?.id?.trim()
  if (!priceId) return 'monthly'

  try {
    const annualPriceId = stripePriceSecretForProduct(productSlug, 'annual')
    if (priceId === annualPriceId) return 'annual'
  } catch {
    // annual price not configured for this product
  }

  return 'monthly'
}

async function updateExistingSubscriptionPrice(
  stripe: Stripe,
  admin: ReturnType<typeof createBillingAdmin>,
  args: {
    userId: string
    subscriptionId: string
    productSlug: string
    priceId: string
    priceInterval: 'monthly' | 'annual'
    couponId: string | null
    upgradedFrom?: string | null
  },
) {
  const subscription = await stripe.subscriptions.retrieve(args.subscriptionId)
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    throw new Error('Subscription is not active.')
  }

  const itemId = subscription.items.data[0]?.id
  if (!itemId) throw new Error('Subscription has no billable item.')

  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [{ id: itemId, price: args.priceId }],
    proration_behavior: 'always_invoice',
    metadata: {
      supabase_user_id: args.userId,
      product_slug: args.productSlug,
      price_interval: args.priceInterval,
      ...(args.upgradedFrom ? { upgraded_from: args.upgradedFrom } : {}),
    },
  }

  if (args.couponId) {
    updateParams.discounts = [{ coupon: args.couponId }]
  }

  const updated = await stripe.subscriptions.update(args.subscriptionId, updateParams)

  await upsertUserSubscriptionFromStripe(admin, {
    userId: args.userId,
    productSlug: args.productSlug,
    subscription: updated,
  })

  return updated
}

async function changeSubscriptionBillingInterval(
  stripe: Stripe,
  admin: ReturnType<typeof createBillingAdmin>,
  args: {
    userId: string
    subscriptionId: string
    productSlug: string
    priceInterval: 'monthly' | 'annual'
    priceId: string
    couponId: string | null
  },
) {
  const subscription = await stripe.subscriptions.retrieve(args.subscriptionId)
  const currentInterval = subscriptionPriceIntervalForProduct(subscription, args.productSlug)
  if (currentInterval === args.priceInterval) {
    throw new Error('You are already on this billing interval.')
  }

  return updateExistingSubscriptionPrice(stripe, admin, {
    userId: args.userId,
    subscriptionId: args.subscriptionId,
    productSlug: args.productSlug,
    priceId: args.priceId,
    priceInterval: args.priceInterval,
    couponId: args.couponId,
  })
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

    let body: {
      product_slug?: string
      price_interval?: string
      apply_early_bird?: boolean
      affiliate_code?: string
    } = {}
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

    const affiliateCodeRaw = String(body.affiliate_code ?? '').trim()
    let affiliateMeta: { affiliate_id: string; affiliate_code: string } | null = null
    let affiliatePromotionCodeId: string | null = null
    if (affiliateCodeRaw) {
      const affiliate = await loadActiveAffiliateByCode(admin, affiliateCodeRaw)
      if (!affiliate) {
        return jsonResponse({ error: 'Affiliate referral code is invalid or inactive.' }, 400)
      }
      if (isSelfReferral(affiliate, auth.user.id, auth.user.email)) {
        return jsonResponse({ error: 'Self-referral is not allowed.' }, 400)
      }
      if (!affiliate.stripe_promotion_code_id?.trim()) {
        return jsonResponse({
          error: 'This affiliate is missing a Stripe promotion code. Ask an admin to paste stripe_promotion_code_id.',
        }, 400)
      }
      affiliateMeta = { affiliate_id: affiliate.id, affiliate_code: affiliate.code }
      affiliatePromotionCodeId = affiliate.stripe_promotion_code_id.trim()
      await upsertCheckoutAttribution(admin, {
        affiliateId: affiliate.id,
        userId: auth.user.id,
        stripeCustomerId: customerId,
        source: 'ref',
      })
    }

    const { success_url, cancel_url } = checkoutReturnUrls(req, productSlug)
    // Creator promo and founding are mutually exclusive.
    const wantsFounding = !affiliateMeta && body.apply_early_bird !== false

    const applyAffiliateToMetadata = (meta: Record<string, string>) => {
      if (!affiliateMeta) return meta
      return {
        ...meta,
        affiliate_id: affiliateMeta.affiliate_id,
        affiliate_code: affiliateMeta.affiliate_code,
      }
    }

    const applyCheckoutDiscount = (sessionParams: Stripe.Checkout.SessionCreateParams, foundingCouponIdValue: string | null) => {
      if (affiliatePromotionCodeId) {
        sessionParams.discounts = [{ promotion_code: affiliatePromotionCodeId }]
        return
      }
      if (foundingCouponIdValue) {
        sessionParams.discounts = [{ coupon: foundingCouponIdValue }]
      }
    }

    let replaceStripeSubscriptionId: string | null = null
    const upgradeFromStarter =
      !isLifetime &&
      productSlug === FULL_PRODUCT_SLUG &&
      (await userHasActiveProduct(admin, auth.user.id, STARTER_PRODUCT_SLUG))
    if (upgradeFromStarter) {
      const starterRow = await getActiveStarterSubscription(admin, auth.user.id)
      replaceStripeSubscriptionId = starterRow?.stripe_subscription_id?.trim() || null
    }

    if (
      !isLifetime &&
      (productSlug === FULL_PRODUCT_SLUG || productSlug === STARTER_PRODUCT_SLUG) &&
      (await userHasActiveProduct(admin, auth.user.id, productSlug))
    ) {
      const activeRow = await getActiveSubscriptionRow(admin, auth.user.id, productSlug)
      if (!activeRow?.stripe_subscription_id) {
        return jsonResponse({ error: 'Active subscription record is missing a Stripe subscription id.' }, 400)
      }

      const subscription = await stripe.subscriptions.retrieve(activeRow.stripe_subscription_id)
      const currentInterval = subscriptionPriceIntervalForProduct(subscription, productSlug)
      if (currentInterval === priceInterval) {
        return jsonResponse({ error: 'You are already on this billing interval.' }, 400)
      }

      if (currentInterval === 'monthly' && priceInterval === 'annual') {
        if (!replaceStripeSubscriptionId) {
          replaceStripeSubscriptionId = activeRow.stripe_subscription_id
        }
      } else {
        try {
          const couponId = foundingCouponId(productSlug, priceInterval, false, wantsFounding)
          await changeSubscriptionBillingInterval(stripe, admin, {
            userId: auth.user.id,
            subscriptionId: activeRow.stripe_subscription_id,
            productSlug,
            priceInterval,
            priceId,
            couponId,
          })
        } catch (intervalErr) {
          const msg = intervalErr instanceof Error ? intervalErr.message : String(intervalErr)
          return jsonResponse({ error: msg || 'Could not update billing interval.' }, 400)
        }

        return jsonResponse({
          url: success_url,
          product_slug: productSlug,
          interval_changed: true,
        })
      }
    }

    if (isLifetime) {
      const replaceSubscriptionIds = await getActiveRecurringStripeSubscriptionIds(admin, auth.user.id)
      let sessionMetadata: Record<string, string> = {
        supabase_user_id: auth.user.id,
        product_slug: productSlug,
      }
      if (replaceSubscriptionIds.length > 0) {
        sessionMetadata.replaces_stripe_subscription_ids = replaceSubscriptionIds.join(',')
      }
      sessionMetadata = applyAffiliateToMetadata(sessionMetadata)

      const couponId = foundingCouponId(productSlug, 'monthly', true, wantsFounding)
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url,
        cancel_url,
        client_reference_id: auth.user.id,
        metadata: sessionMetadata,
        payment_intent_data: {
          metadata: sessionMetadata,
        },
      }
      applyCheckoutDiscount(sessionParams, couponId)

      const session = await stripe.checkout.sessions.create(sessionParams)

      if (!session.url) {
        throw new Error('Stripe Checkout session missing url.')
      }

      return jsonResponse({ url: session.url, product_slug: productSlug })
    }

    const couponId = foundingCouponId(productSlug, priceInterval, false, wantsFounding)
    const checkoutRequiresPayment = Boolean(replaceStripeSubscriptionId)
    let sessionMetadata: Record<string, string> = {
      supabase_user_id: auth.user.id,
      product_slug: productSlug,
      price_interval: priceInterval,
    }
    if (replaceStripeSubscriptionId) {
      sessionMetadata.replaces_stripe_subscription_id = replaceStripeSubscriptionId
      if (upgradeFromStarter) {
        sessionMetadata.upgraded_from = STARTER_PRODUCT_SLUG
      }
    }
    sessionMetadata = applyAffiliateToMetadata(sessionMetadata)

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      client_reference_id: auth.user.id,
      payment_method_collection: checkoutRequiresPayment ? 'always' : 'if_required',
      subscription_data: {
        metadata: sessionMetadata,
      },
      metadata: sessionMetadata,
    }

    applyCheckoutDiscount(sessionParams, couponId)

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
