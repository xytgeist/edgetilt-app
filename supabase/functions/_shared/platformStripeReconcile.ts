import Stripe from 'npm:stripe@17.7.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  isCreatorFanSubscriptionMetadata,
  upsertUserSubscriptionFromStripe,
  type StripeSubscriptionPayload,
} from './billingDb.ts'

const PLATFORM_RECURRING_SLUGS = new Set(['slots-edge', 'slots-edge-starter'])

function toPayload(sub: Stripe.Subscription): StripeSubscriptionPayload {
  const customer =
    typeof sub.customer === 'string' ? sub.customer : sub.customer?.id != null ? String(sub.customer.id) : ''
  return {
    id: sub.id,
    customer,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: sub.current_period_end,
    metadata: (sub.metadata ?? {}) as Record<string, string>,
  }
}

function platformProductSlugFromSubscription(sub: Stripe.Subscription): string | null {
  const slug = sub.metadata?.product_slug?.trim() || null
  if (slug && PLATFORM_RECURRING_SLUGS.has(slug)) return slug
  return null
}

function isPlatformRecurringSubscription(sub: Stripe.Subscription): boolean {
  if (isCreatorFanSubscriptionMetadata(sub.metadata as Record<string, string>)) return false
  return platformProductSlugFromSubscription(sub) != null
}

export type PlatformBillingReconcileResult = {
  scanned: number
  synced: number
  skipped: number
  errors: string[]
}

async function resolvePlatformUserId(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = subscription.metadata?.supabase_user_id?.trim() || null
  if (fromMeta) return fromMeta

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id != null
        ? String(subscription.customer.id)
        : null
  if (!customerId) return null

  const { data, error } = await admin
    .from('profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (error) throw new Error(`profiles stripe_customer_id lookup: ${error.message}`)
  return data?.user_id ?? null
}

/** Stripe grant-worthy platform subs → user_subscriptions (fixes stale incomplete rows). */
export async function reconcileAllPlatformSubscriptions(
  admin: SupabaseClient,
  stripe: Stripe,
  opts?: { dryRun?: boolean },
): Promise<PlatformBillingReconcileResult> {
  const result: PlatformBillingReconcileResult = { scanned: 0, synced: 0, skipped: 0, errors: [] }
  const statuses: Stripe.SubscriptionListParams['status'][] = ['active', 'trialing', 'past_due']

  for (const status of statuses) {
    let startingAfter: string | undefined
    for (;;) {
      const page = await stripe.subscriptions.list({
        status,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })

      for (const sub of page.data) {
        if (!isPlatformRecurringSubscription(sub)) {
          result.skipped++
          continue
        }

        const productSlug = platformProductSlugFromSubscription(sub)
        if (!productSlug) {
          result.skipped++
          continue
        }

        let userId: string | null = null
        try {
          userId = await resolvePlatformUserId(admin, sub)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          result.errors.push(`${sub.id}: ${msg}`)
          continue
        }

        if (!userId) {
          result.skipped++
          continue
        }

        result.scanned++
        if (opts?.dryRun) {
          result.synced++
          continue
        }

        try {
          await upsertUserSubscriptionFromStripe(admin, {
            userId,
            productSlug,
            subscription: toPayload(sub),
          })
          result.synced++
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          result.errors.push(`${sub.id}: ${msg}`)
        }
      }

      if (!page.has_more || page.data.length === 0) break
      startingAfter = page.data[page.data.length - 1]?.id
    }
  }

  return result
}

/** Repair user_subscriptions rows stuck at incomplete when Stripe subscription is grant-worthy. */
export async function reconcileStaleIncompletePlatformRows(
  admin: SupabaseClient,
  stripe: Stripe,
  opts?: { dryRun?: boolean },
): Promise<PlatformBillingReconcileResult> {
  const result: PlatformBillingReconcileResult = { scanned: 0, synced: 0, skipped: 0, errors: [] }

  const { data: staleRows, error } = await admin
    .from('user_subscriptions')
    .select('user_id, product_slug, stripe_subscription_id, status')
    .eq('status', 'incomplete')
    .in('product_slug', ['slots-edge', 'slots-edge-starter'])
  if (error) throw new Error(`user_subscriptions incomplete scan: ${error.message}`)

  for (const row of staleRows ?? []) {
    const subId = String(row.stripe_subscription_id ?? '').trim()
    if (!subId || subId.startsWith('test_') || subId.startsWith('admin_comp_')) {
      result.skipped++
      continue
    }

    result.scanned++
    if (opts?.dryRun) {
      result.synced++
      continue
    }

    try {
      const sub = await stripe.subscriptions.retrieve(subId)
      if (sub.status !== 'active' && sub.status !== 'trialing' && sub.status !== 'past_due') {
        result.skipped++
        continue
      }

      const productSlug =
        sub.metadata?.product_slug?.trim() ||
        String(row.product_slug || '').trim() ||
        'slots-edge'

      let userId = sub.metadata?.supabase_user_id?.trim() || String(row.user_id || '').trim() || null
      if (!userId) {
        userId = await resolvePlatformUserId(admin, sub)
      }
      if (!userId) {
        result.skipped++
        continue
      }

      await upsertUserSubscriptionFromStripe(admin, {
        userId,
        productSlug,
        subscription: toPayload(sub),
      })
      result.synced++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`${subId}: ${msg}`)
    }
  }

  return result
}

export async function reconcilePlatformBilling(
  admin: SupabaseClient,
  stripe: Stripe,
  opts?: { dryRun?: boolean },
): Promise<PlatformBillingReconcileResult> {
  const stale = await reconcileStaleIncompletePlatformRows(admin, stripe, opts)
  const live = await reconcileAllPlatformSubscriptions(admin, stripe, opts)
  return {
    scanned: stale.scanned + live.scanned,
    synced: stale.synced + live.synced,
    skipped: stale.skipped + live.skipped,
    errors: [...stale.errors, ...live.errors],
  }
}
