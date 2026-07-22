/**
 * Clears cancel_at_period_end on an active creator fan Stripe subscription.
 */
import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'

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

    const { data: fanSub, error: fanSubErr } = await admin
      .from('creator_subscriptions')
      .select('stripe_subscription_id, status, cancel_at_period_end')
      .eq('subscriber_user_id', auth.user.id)
      .eq('creator_user_id', creatorUserId)
      .maybeSingle()
    if (fanSubErr) throw new Error(fanSubErr.message)

    const stripeSubId = String(fanSub?.stripe_subscription_id || '').trim()
    const fanStatus = String(fanSub?.status || '')
    const fanActive = fanStatus === 'active' || fanStatus === 'trialing'
    if (!fanActive || !stripeSubId.startsWith('sub_')) {
      return jsonResponse({ error: 'No active fan subscription found to resume.' }, 400)
    }
    if (!fanSub?.cancel_at_period_end) {
      return jsonResponse({ error: 'This subscription is not scheduled to cancel.' }, 400)
    }

    const stripe = new Stripe(requireStripeSecretKey())
    await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: false })

    const { error: updateErr } = await admin
      .from('creator_subscriptions')
      .update({
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('subscriber_user_id', auth.user.id)
      .eq('creator_user_id', creatorUserId)
    if (updateErr) throw new Error(updateErr.message)

    return jsonResponse({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
