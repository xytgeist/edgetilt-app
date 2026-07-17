/**
 * Stripe Connect Express for creator affiliates.
 * Actions: onboard | refresh | pay
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

async function assertAdmin(admin: ReturnType<typeof createBillingAdmin>, userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.role !== 'admin') {
    return false
  }
  return true
}

async function loadAffiliateForUser(
  admin: ReturnType<typeof createBillingAdmin>,
  userId: string,
) {
  const { data, error } = await admin
    .from('affiliates')
    .select(
      'id, code, display_name, contact_email, user_id, status, stripe_connect_account_id, connect_onboarding_complete',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
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

    let body: { action?: string; commission_ids?: string[] } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const action = String(body.action || 'onboard').trim().toLowerCase()
    const stripe = new Stripe(requireStripeSecretKey())
    const origin = appOrigin(req)

    if (action === 'onboard' || action === 'refresh') {
      const affiliate = await loadAffiliateForUser(admin, auth.user.id)
      if (!affiliate) {
        return jsonResponse({ error: 'You are not linked as an active affiliate.' }, 403)
      }

      let accountId = affiliate.stripe_connect_account_id?.trim() || null
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: affiliate.contact_email || auth.user.email || undefined,
          capabilities: {
            transfers: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            affiliate_id: affiliate.id,
            affiliate_code: affiliate.code,
            supabase_user_id: auth.user.id,
          },
        })
        accountId = account.id
        const { error: upErr } = await admin
          .from('affiliates')
          .update({
            stripe_connect_account_id: accountId,
            connect_onboarding_complete: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', affiliate.id)
        if (upErr) throw new Error(upErr.message)
      }

      if (action === 'refresh') {
        const account = await stripe.accounts.retrieve(accountId)
        const complete = Boolean(
          account.details_submitted && account.charges_enabled && account.payouts_enabled,
        )
        const { error: upErr } = await admin
          .from('affiliates')
          .update({
            connect_onboarding_complete: complete,
            updated_at: new Date().toISOString(),
          })
          .eq('id', affiliate.id)
        if (upErr) throw new Error(upErr.message)
        return jsonResponse({
          account_id: accountId,
          connect_onboarding_complete: complete,
        })
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/?tab=creator&connect=refresh`,
        return_url: `${origin}/?tab=creator&connect=return`,
        type: 'account_onboarding',
      })

      return jsonResponse({ url: link.url, account_id: accountId })
    }

    if (action === 'pay') {
      const isAdmin = await assertAdmin(admin, auth.user.id)
      if (!isAdmin) return jsonResponse({ error: 'admin only' }, 403)

      const ids = Array.isArray(body.commission_ids)
        ? body.commission_ids.map((id) => String(id).trim()).filter(Boolean)
        : []
      if (ids.length === 0) {
        return jsonResponse({ error: 'commission_ids required' }, 400)
      }

      const { data: commissions, error: cErr } = await admin
        .from('affiliate_commissions')
        .select('id, affiliate_id, commission_cents, status')
        .in('id', ids)
        .eq('status', 'payable')
      if (cErr) throw new Error(cErr.message)

      const byAffiliate = new Map<string, { ids: string[]; cents: number }>()
      for (const row of commissions || []) {
        const cur = byAffiliate.get(row.affiliate_id) || { ids: [], cents: 0 }
        cur.ids.push(row.id)
        cur.cents += Number(row.commission_cents) || 0
        byAffiliate.set(row.affiliate_id, cur)
      }

      const results: Array<{ affiliate_id: string; transfer_id?: string; error?: string; paid: number }> = []

      for (const [affiliateId, bundle] of byAffiliate.entries()) {
        if (bundle.cents <= 0) continue
        const { data: aff } = await admin
          .from('affiliates')
          .select('id, stripe_connect_account_id, connect_onboarding_complete, code')
          .eq('id', affiliateId)
          .maybeSingle()

        if (!aff?.stripe_connect_account_id || !aff.connect_onboarding_complete) {
          results.push({
            affiliate_id: affiliateId,
            error: 'Affiliate missing completed Connect account',
            paid: 0,
          })
          continue
        }

        try {
          const transfer = await stripe.transfers.create({
            amount: bundle.cents,
            currency: 'usd',
            destination: aff.stripe_connect_account_id,
            metadata: {
              affiliate_id: affiliateId,
              affiliate_code: aff.code || '',
              commission_ids: bundle.ids.join(','),
            },
          })

          const { error: markErr } = await admin
            .from('affiliate_commissions')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              payout_ref: transfer.id,
              updated_at: new Date().toISOString(),
            })
            .in('id', bundle.ids)
            .eq('status', 'payable')
          if (markErr) throw new Error(markErr.message)

          results.push({
            affiliate_id: affiliateId,
            transfer_id: transfer.id,
            paid: bundle.ids.length,
          })
        } catch (payErr) {
          const msg = payErr instanceof Error ? payErr.message : String(payErr)
          results.push({ affiliate_id: affiliateId, error: msg, paid: 0 })
        }
      }

      return jsonResponse({ ok: true, results })
    }

    return jsonResponse({ error: 'Unknown action. Use onboard, refresh, or pay.' }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg || 'Server error' }, 500)
  }
})
