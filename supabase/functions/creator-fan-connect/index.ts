/**
 * Stripe Connect Express for creator fan subscriptions (70/30).
 * Actions: onboard | refresh
 */
import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'
import { appOriginFromRequest, runCreatorFanConnectAction } from '../_shared/creatorFanConnectOps.ts'

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

    let body: { action?: string } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const rawAction = String(body.action || 'onboard').trim().toLowerCase()
    const action =
      rawAction === 'refresh'
        ? 'refresh'
        : rawAction === 'reconnect'
          ? 'reconnect'
          : 'onboard'
    const stripe = new Stripe(requireStripeSecretKey())
    const origin = appOriginFromRequest(req)

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('handle, display_name')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (profErr) throw new Error(profErr.message)

    const returnUrls = {
      refresh_url: `${origin}/?settings=fan&connect=refresh`,
      return_url: `${origin}/?settings=fan&connect=return`,
    }

    const result = await runCreatorFanConnectAction(
      admin,
      stripe,
      auth.user.id,
      { handle: profile?.handle ?? '', display_name: profile?.display_name },
      auth.user.email,
      origin,
      returnUrls,
      action,
    )

    return jsonResponse(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
