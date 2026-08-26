import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import {
  assertActiveProduct,
  createBillingAdmin,
  getUserFromJwt,
  upsertAppleIapSubscription,
} from '../_shared/billingDb.ts'

const PRODUCT_ID_TO_SLUG: Record<string, string> = {
  'com.edgetilt.app.slots_edge_starter.monthly': 'slots-edge-starter',
  'com.edgetilt.app.slots_edge_starter.annual': 'slots-edge-starter',
  'com.edgetilt.app.slots_edge.monthly': 'slots-edge',
  'com.edgetilt.app.slots_edge.annual': 'slots-edge',
  'com.edgetilt.app.slots_edge_lifetime': 'slots-edge-lifetime',
}

function intervalFromProductId(productId: string): 'monthly' | 'annual' | null {
  if (productId.endsWith('.annual')) return 'annual'
  if (productId.endsWith('.monthly')) return 'monthly'
  return null
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
    if ('error' in auth) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const body = await req.json().catch(() => ({}))
    const productSlugRaw = String(body?.product_slug || '').trim()
    const productIdRaw = String(body?.product_id || '').trim()
    const originalTx = String(body?.original_transaction_id || '').trim()
    const transactionId = String(body?.transaction_id || originalTx || '').trim()

    const productSlug = productSlugRaw || PRODUCT_ID_TO_SLUG[productIdRaw] || ''
    const appleProductId = productIdRaw || ''

    if (!productSlug || !originalTx || !appleProductId) {
      return jsonResponse({ error: 'Missing product or transaction identifiers.' }, 400)
    }

    const productCheck = await assertActiveProduct(admin, productSlug)
    if (!productCheck.ok) {
      return jsonResponse({ error: productCheck.error }, productCheck.status)
    }

    const priceIntervalRaw = String(body?.price_interval || '').trim().toLowerCase()
    const priceInterval =
      priceIntervalRaw === 'annual' || priceIntervalRaw === 'monthly'
        ? priceIntervalRaw
        : intervalFromProductId(appleProductId)

    const expiresAt =
      typeof body?.expires_at === 'string' && body.expires_at.trim()
        ? body.expires_at.trim()
        : null

    const isLifetime = productSlug === 'slots-edge-lifetime'

    await upsertAppleIapSubscription(admin, {
      userId: auth.user.id,
      productSlug,
      appleProductId,
      originalTransactionId: originalTx,
      transactionId,
      priceInterval,
      expiresAt,
      isLifetime,
    })

    return jsonResponse({ ok: true, product_slug: productSlug })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('apple-iap-verify:', message)
    return jsonResponse({ error: message || 'Verification failed.' }, 500)
  }
})
