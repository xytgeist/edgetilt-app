/**
 * Stripe Connect Express for creator fan subscriptions (70/30).
 * Actions: onboard | refresh
 */
import Stripe from 'npm:stripe@17.7.0'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'

function appOrigin(req: Request): string {
  const fromEnv = Deno.env.get('PUBLIC_APP_URL')?.trim() || Deno.env.get('APP_ORIGIN')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const origin = req.headers.get('origin')?.trim()
  if (origin) return origin.replace(/\/$/, '')
  return 'https://edgetilt.com'
}

async function ensureMonetizationRow(admin: ReturnType<typeof createBillingAdmin>, userId: string) {
  const { data: existing } = await admin
    .from('creator_monetization_profiles')
    .select('user_id, stripe_connect_account_id, connect_onboarding_complete')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing

  const { data: inserted, error } = await admin
    .from('creator_monetization_profiles')
    .insert({
      user_id: userId,
      fan_tier_key: 'fan-tier-999',
      enabled: false,
      connect_onboarding_complete: false,
    })
    .select('user_id, stripe_connect_account_id, connect_onboarding_complete')
    .single()
  if (error) throw new Error(error.message)
  return inserted
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

    let body: { action?: string } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const action = String(body.action || 'onboard').trim().toLowerCase()
    const stripe = new Stripe(requireStripeSecretKey())
    const origin = appOrigin(req)

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('handle, display_name')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (profErr) throw new Error(profErr.message)
    if (!profile?.handle?.trim()) {
      return jsonResponse({ error: 'Set a profile handle before fan subscriptions.' }, 400)
    }

    const row = await ensureMonetizationRow(admin, auth.user.id)

    let accountId = row.stripe_connect_account_id?.trim() || null
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: auth.user.email || undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          url: origin,
          product_description:
            'Creator fan subscriptions on EdgeTilt: fan-only posts and fan group chat.',
          mcc: '7399',
        },
        metadata: {
          billing_kind: 'creator_fan_connect',
          supabase_user_id: auth.user.id,
          handle: profile.handle,
        },
      })
      accountId = account.id
      const { error: upErr } = await admin
        .from('creator_monetization_profiles')
        .update({
          stripe_connect_account_id: accountId,
          connect_onboarding_complete: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', auth.user.id)
      if (upErr) throw new Error(upErr.message)
    }

    if (action === 'refresh') {
      const account = await stripe.accounts.retrieve(accountId)
      const complete = Boolean(
        account.details_submitted && account.charges_enabled && account.payouts_enabled,
      )
      const { error: upErr } = await admin
        .from('creator_monetization_profiles')
        .update({
          connect_onboarding_complete: complete,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', auth.user.id)
      if (upErr) throw new Error(upErr.message)
      return jsonResponse({
        account_id: accountId,
        connect_onboarding_complete: complete,
      })
    }

    const account = await stripe.accounts.retrieve(accountId)
    const onboarded = Boolean(
      account.details_submitted && account.charges_enabled && account.payouts_enabled,
    )
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/?settings=fan&connect=refresh`,
      return_url: `${origin}/?settings=fan&connect=return`,
      type: onboarded ? 'account_update' : 'account_onboarding',
    })

    return jsonResponse({ url: link.url, account_id: accountId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
