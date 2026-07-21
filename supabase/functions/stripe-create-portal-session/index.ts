import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'

let cachedPortalConfigurationId: string | null = null

async function billingPortalConfigurationId(stripe: Stripe): Promise<string> {
  const fromEnv = Deno.env.get('STRIPE_BILLING_PORTAL_CONFIGURATION_ID')?.trim()
  if (fromEnv) return fromEnv

  if (cachedPortalConfigurationId) return cachedPortalConfigurationId

  const existing = await stripe.billingPortal.configurations.list({ limit: 10 })
  const withCancel = existing.data.find((config) => config.features?.subscription_cancel?.enabled === true)
  if (withCancel?.id) {
    cachedPortalConfigurationId = withCancel.id
    return withCancel.id
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: 'Manage your Edge subscription',
    },
    features: {
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_update: { enabled: false },
    },
  })
  cachedPortalConfigurationId = created.id
  return created.id
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

    /** @type {{ creator_user_id?: string }} */
    let body: { creator_user_id?: string } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const creatorUserId = String(body.creator_user_id || '').trim()

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (profileErr) throw new Error(profileErr.message)

    const customerId = profile?.stripe_customer_id?.trim()
    if (!customerId) {
      return jsonResponse({ error: 'No billing account yet. Subscribe to a plan first.' }, 400)
    }

    const origin =
      req.headers.get('origin')?.trim() ||
      Deno.env.get('STRIPE_CHECKOUT_DEFAULT_ORIGIN')?.trim() ||
      'http://localhost:5173'
    const base = origin.replace(/\/+$/, '')
    const returnUrl = creatorUserId
      ? `${base}/?billing=portal&fan_creator=${encodeURIComponent(creatorUserId)}`
      : `${base}/?billing=portal`

    const stripe = new Stripe(requireStripeSecretKey())
    const configurationId = await billingPortalConfigurationId(stripe)

    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: returnUrl,
      configuration: configurationId,
    }

    if (creatorUserId) {
      const { data: fanSub, error: fanSubErr } = await admin
        .from('creator_subscriptions')
        .select('stripe_subscription_id, status')
        .eq('subscriber_user_id', auth.user.id)
        .eq('creator_user_id', creatorUserId)
        .maybeSingle()
      if (fanSubErr) throw new Error(fanSubErr.message)

      const stripeSubId = String(fanSub?.stripe_subscription_id || '').trim()
      const fanStatus = String(fanSub?.status || '')
      const fanActive = fanStatus === 'active' || fanStatus === 'trialing'
      if (!fanActive || !stripeSubId.startsWith('sub_')) {
        return jsonResponse(
          { error: 'No active fan subscription found to manage in billing.' },
          400,
        )
      }

      sessionParams.flow_data = {
        type: 'subscription_cancel',
        subscription_cancel: {
          subscription: stripeSubId,
        },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: returnUrl },
        },
      }
    }

    const portal = await stripe.billingPortal.sessions.create(sessionParams)

    return jsonResponse({ url: portal.url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
