/**
 * Stripe Connect Express for creator fan subscriptions (shared user JWT + admin bot setup).
 */
import Stripe from 'npm:stripe@17.7.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function appOriginFromRequest(req: Request): string {
  const fromEnv = Deno.env.get('PUBLIC_APP_URL')?.trim() || Deno.env.get('APP_ORIGIN')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const origin = req.headers.get('origin')?.trim()
  if (origin) return origin.replace(/\/$/, '')
  return 'https://edgetilt.com'
}

export type FanConnectReturnUrls = {
  refresh_url: string
  return_url: string
}

export type CreatorFanConnectAction = 'onboard' | 'refresh' | 'reconnect'

/** Destination charges for fan subs; bank payouts can lag after charges are enabled. */
export function stripeConnectReadyForFanSubs(account: Stripe.Account): boolean {
  if (!account.details_submitted) return false
  if (account.charges_enabled) return true
  if (account.capabilities?.transfers === 'active') return true
  return Boolean(account.payouts_enabled)
}

/**
 * Stripe only allows account_update after Express finishes Stripe's own onboarding
 * checklist (not the same as our fan-sub "ready" flag). Prefer update when it looks
 * fully live; callers must fall back to onboarding if Stripe rejects update.
 */
export function stripeExpressAccountLinkType(
  account: Stripe.Account,
): 'account_onboarding' | 'account_update' {
  const stripeFullyOnboarded = Boolean(
    account.details_submitted && account.charges_enabled && account.payouts_enabled,
  )
  return stripeFullyOnboarded ? 'account_update' : 'account_onboarding'
}

async function createFanConnectAccountLink(
  stripe: Stripe,
  accountId: string,
  returnUrls: FanConnectReturnUrls,
  preferred: 'account_onboarding' | 'account_update',
): Promise<Stripe.AccountLink> {
  try {
    return await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrls.refresh_url,
      return_url: returnUrls.return_url,
      type: preferred,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Stripe: update only valid after full Express onboarding; otherwise only onboarding.
    if (
      preferred === 'account_update' &&
      /account_onboarding|account_update/i.test(msg)
    ) {
      return await stripe.accountLinks.create({
        account: accountId,
        refresh_url: returnUrls.refresh_url,
        return_url: returnUrls.return_url,
        type: 'account_onboarding',
      })
    }
    throw err
  }
}

export async function ensureCreatorMonetizationRow(admin: SupabaseClient, userId: string) {
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

export async function runCreatorFanConnectAction(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  profile: { handle: string; display_name?: string | null },
  authEmail: string | null | undefined,
  origin: string,
  returnUrls: FanConnectReturnUrls,
  action: CreatorFanConnectAction,
) {
  if (!profile?.handle?.trim()) {
    throw new Error('Set a profile handle before fan subscriptions.')
  }

  await ensureCreatorMonetizationRow(admin, userId)

  // Detach existing Express account so onboard creates a fresh one (switch bank / entity).
  if (action === 'reconnect') {
    const { error: clearErr } = await admin
      .from('creator_monetization_profiles')
      .update({
        stripe_connect_account_id: null,
        connect_onboarding_complete: false,
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (clearErr) throw new Error(clearErr.message)
  }

  const row = await ensureCreatorMonetizationRow(admin, userId)

  let accountId = row.stripe_connect_account_id?.trim() || null
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: authEmail || undefined,
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
        supabase_user_id: userId,
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
      .eq('user_id', userId)
    if (upErr) throw new Error(upErr.message)
  }

  if (action === 'refresh') {
    const account = await stripe.accounts.retrieve(accountId)
    const complete = stripeConnectReadyForFanSubs(account)
    const { error: upErr } = await admin
      .from('creator_monetization_profiles')
      .update({
        connect_onboarding_complete: complete,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (upErr) throw new Error(upErr.message)
    return {
      account_id: accountId,
      connect_onboarding_complete: complete,
    }
  }

  const account = await stripe.accounts.retrieve(accountId)
  const linkType = stripeExpressAccountLinkType(account)
  const link = await createFanConnectAccountLink(stripe, accountId, returnUrls, linkType)

  return {
    url: link.url,
    account_id: accountId,
    reconnected: action === 'reconnect',
  }
}
