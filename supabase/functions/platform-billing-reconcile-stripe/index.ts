/**
 * Service-role / cron: reconcile platform user_subscriptions from Stripe (Starter / Pro).
 * Repairs stale incomplete rows when Stripe shows active + paid.
 */
import { createBillingAdmin } from '../_shared/billingDb.ts'
import { requireStripeSecretKey } from '../_shared/billingEnv.ts'
import { reconcilePlatformBilling } from '../_shared/platformStripeReconcile.ts'
import Stripe from 'npm:stripe@17.7.0'

function authorize(req: Request): boolean {
  const expected = Deno.env.get('PLATFORM_BILLING_RECONCILE_CRON_SECRET')?.trim()
  if (!expected) return false
  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  const headerSecret = req.headers.get('x-platform-billing-reconcile-secret')?.trim()
  return auth === expected || headerSecret === expected
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = createBillingAdmin()
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const authHeader = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  const isServiceRole = Boolean(serviceRole && authHeader === serviceRole)
  if (!isServiceRole && !authorize(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  try {
    const stripe = new Stripe(requireStripeSecretKey())
    const result = await reconcilePlatformBilling(admin, stripe, { dryRun })
    return new Response(JSON.stringify({ ok: true, dryRun, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('platform-billing-reconcile-stripe', msg)
    return new Response(
      JSON.stringify({
        ok: false,
        error: msg,
        scanned: 0,
        synced: 0,
        skipped: 0,
        errors: [msg],
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
