import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt, listActiveRecurringStripeSubscriptionIds } from '../_shared/billingDb.ts'

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
    const returnUrl = `${origin.replace(/\/+$/, '')}/?billing=portal`

    const stripe = new Stripe(requireStripeSecretKey())
    const configurationId = await billingPortalConfigurationId(stripe)

    const recurringSubscriptionIds = await listActiveRecurringStripeSubscriptionIds(admin, auth.user.id)
    const cancelSubscriptionId = recurringSubscriptionIds[0] ?? null

    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: returnUrl,
      configuration: configurationId,
    }

    if (cancelSubscriptionId) {
      sessionParams.flow_data = {
        type: 'subscription_cancel',
        subscription_cancel: {
          subscription: cancelSubscriptionId,
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
