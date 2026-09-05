import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import {
  APPLE_IAP_FAN_PRODUCT_TO_TIER,
  APPLE_IAP_PLATFORM_PRODUCT_TO_SLUG,
  decodeAppleJwsPayload,
  expiresAtFromApplePayload,
  intervalFromAppleProductId,
} from '../_shared/appleIapCatalog.ts'
import {
  assertActiveProduct,
  consumeAppleIapIntent,
  createBillingAdmin,
  getUserFromJwt,
  insertAppleIapIntent,
  upsertAppleIapCreatorFanSubscription,
  upsertAppleIapSubscription,
} from '../_shared/billingDb.ts'

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
    const action = String(body?.action || 'confirm').trim().toLowerCase()

    if (action === 'begin') {
      const productId = String(body?.product_id || '').trim()
      const kindRaw = String(body?.kind || 'platform').trim()
      const kind = kindRaw === 'creator_fan' ? 'creator_fan' : 'platform'
      if (!productId) return jsonResponse({ error: 'Missing product_id.' }, 400)
      if (kind === 'creator_fan' && !String(body?.creator_user_id || '').trim()) {
        return jsonResponse({ error: 'Missing creator_user_id.' }, 400)
      }
      await insertAppleIapIntent(admin, {
        userId: auth.user.id,
        productId,
        kind,
        productSlug: String(body?.product_slug || '').trim() || null,
        creatorUserId: String(body?.creator_user_id || '').trim() || null,
        fanTierKey: String(body?.fan_tier_key || '').trim() || null,
      })
      return jsonResponse({ ok: true, action: 'begin' })
    }

    const jws = String(body?.signed_transaction_info || '').trim()
    const claims = decodeAppleJwsPayload(jws)
    const productIdRaw =
      String(claims?.productId || body?.product_id || '').trim()
    const originalTx = String(
      claims?.originalTransactionId || body?.original_transaction_id || '',
    ).trim()
    const transactionId = String(
      claims?.transactionId || body?.transaction_id || originalTx || '',
    ).trim()

    if (!productIdRaw || !originalTx) {
      return jsonResponse({ error: 'Missing product or transaction identifiers.' }, 400)
    }

    const isRestore = body?.restore === true
    const intent = await consumeAppleIapIntent(admin, {
      userId: auth.user.id,
      productId: productIdRaw,
    }).catch(() => null)

    const fanTierFromProduct = APPLE_IAP_FAN_PRODUCT_TO_TIER[productIdRaw] || ''
    const platformSlug =
      APPLE_IAP_PLATFORM_PRODUCT_TO_SLUG[productIdRaw] ||
      String(body?.product_slug || '').trim()
    const kind =
      String(body?.kind || intent?.kind || '').trim() === 'creator_fan' || fanTierFromProduct
        ? 'creator_fan'
        : 'platform'

    const expiresAt =
      expiresAtFromApplePayload(claims) ||
      (typeof body?.expires_at === 'string' && body.expires_at.trim()
        ? body.expires_at.trim()
        : null)

    if (kind === 'creator_fan') {
      const fanTierKey =
        String(intent?.fan_tier_key || body?.fan_tier_key || fanTierFromProduct || '').trim()
      const creatorUserId = String(
        intent?.creator_user_id || body?.creator_user_id || '',
      ).trim()
      if (!fanTierKey || !creatorUserId) {
        if (isRestore) {
          const { data: existingFan, error: existingFanErr } = await admin
            .from('creator_subscriptions')
            .select('creator_user_id, fan_tier_key')
            .eq('apple_original_transaction_id', originalTx)
            .eq('subscriber_user_id', auth.user.id)
            .maybeSingle()
          if (existingFanErr) throw new Error(existingFanErr.message)
          if (existingFan?.creator_user_id && existingFan?.fan_tier_key) {
            await upsertAppleIapCreatorFanSubscription(admin, {
              subscriberUserId: auth.user.id,
              creatorUserId: String(existingFan.creator_user_id),
              fanTierKey: String(existingFan.fan_tier_key),
              appleProductId: productIdRaw,
              originalTransactionId: originalTx,
              transactionId,
              expiresAt,
            })
            return jsonResponse({ ok: true, kind: 'creator_fan', restored: true })
          }
          return jsonResponse({ ok: true, restored: false, reason: 'no_fan_intent' })
        }
        return jsonResponse({ error: 'Missing creator or fan tier for this purchase.' }, 400)
      }
      if (fanTierFromProduct && fanTierFromProduct !== fanTierKey) {
        return jsonResponse({ error: 'Fan tier does not match the App Store product.' }, 400)
      }
      await upsertAppleIapCreatorFanSubscription(admin, {
        subscriberUserId: auth.user.id,
        creatorUserId,
        fanTierKey,
        appleProductId: productIdRaw,
        originalTransactionId: originalTx,
        transactionId,
        expiresAt,
      })
      return jsonResponse({ ok: true, kind: 'creator_fan', creator_user_id: creatorUserId })
    }

    const productSlug = platformSlug || String(intent?.product_slug || '').trim()
    if (!productSlug) {
      return jsonResponse({ error: 'Unknown App Store product.' }, 400)
    }

    const productCheck = await assertActiveProduct(admin, productSlug)
    if (!productCheck.ok) {
      return jsonResponse({ error: productCheck.error }, productCheck.status)
    }

    const priceIntervalRaw = String(body?.price_interval || '').trim().toLowerCase()
    const priceInterval =
      priceIntervalRaw === 'annual' || priceIntervalRaw === 'monthly'
        ? priceIntervalRaw
        : intervalFromAppleProductId(productIdRaw)

    const isLifetime = productSlug === 'slots-edge-lifetime'

    await upsertAppleIapSubscription(admin, {
      userId: auth.user.id,
      productSlug,
      appleProductId: productIdRaw,
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
