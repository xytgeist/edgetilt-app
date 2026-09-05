/**
 * StoreKit IAP bridge + server verify for EdgeiOS shell.
 * Product ids must match App Store Connect + `EdgeStoreKitManager.swift`.
 */
import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'
import { restoreSupabaseSession } from './supabaseSessionRestore.js'
import {
  EDGE_IAP_PRODUCT_IDS,
  allKnownIapProductIds,
  iapProductIdForFanTier,
  iapProductIdForPlan,
  indexStoreProductsById,
} from './edgeIapProducts.js'

export {
  EDGE_IAP_PRODUCT_IDS,
  allKnownIapProductIds,
  iapProductIdForFanTier,
  iapProductIdForPlan,
  indexStoreProductsById,
} from './edgeIapProducts.js'

/** @typedef {'monthly' | 'annual'} IapPriceInterval */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} productIds
 */
export async function fetchEdgeStoreProducts(supabaseClient, productIds) {
  if (!isEdgeiOSShell()) return { products: [], via: 'noop' }
  const ids = (productIds || []).filter(Boolean)
  if (!ids.length) return { products: [], via: 'noop' }
  const result = await edgeNativeInvoke('getStoreProducts', { productIds: ids })
  const products = Array.isArray(result?.products) ? result.products : []
  void supabaseClient
  return { products, via: 'bridge' }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   productId: string,
 *   kind: 'platform' | 'creator_fan',
 *   productSlug?: string | null,
 *   creatorUserId?: string | null,
 *   fanTierKey?: string | null,
 * }} intent
 */
async function beginAppleIapIntent(supabaseClient, intent) {
  const session = await restoreSupabaseSession(supabaseClient)
  if (!session?.access_token) {
    const err = new Error('Sign in to continue to checkout.')
    err.code = 'CHECKOUT_AUTH_REQUIRED'
    throw err
  }
  const { error } = await supabaseClient.functions.invoke('apple-iap-verify', {
    body: {
      action: 'begin',
      product_id: intent.productId,
      kind: intent.kind,
      product_slug: intent.productSlug || null,
      creator_user_id: intent.creatorUserId || null,
      fan_tier_key: intent.fanTierKey || null,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) throw new Error(error.message || 'Could not start App Store purchase.')
  return session
}

/**
 * @param {Record<string, unknown>} purchase
 */
function purchaseOutcome(purchase) {
  if (purchase?.status === 'cancelled') return { ok: false, cancelled: true }
  if (purchase?.status === 'pending') {
    return { ok: false, pending: true }
  }
  if (purchase?.ok === false && !purchase?.signedTransactionInfo) {
    throw new Error('Purchase did not complete.')
  }
  return { ok: true, purchase }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} productSlug
 * @param {{ priceInterval?: IapPriceInterval }} [options]
 */
export async function startEdgeIapPurchase(supabaseClient, productSlug, options = {}) {
  if (!isEdgeiOSShell()) {
    throw new Error('In-app purchase is only available in the Edge app.')
  }
  const productId = iapProductIdForPlan(productSlug, options.priceInterval || 'monthly')
  if (!productId) throw new Error('This plan is not available for in-app purchase.')

  let session
  try {
    session = await beginAppleIapIntent(supabaseClient, {
      productId,
      kind: 'platform',
      productSlug,
    })
  } catch {
    session = await restoreSupabaseSession(supabaseClient)
    if (!session?.user?.id) {
      const err = new Error('Sign in to continue to checkout.')
      err.code = 'CHECKOUT_AUTH_REQUIRED'
      throw err
    }
  }

  const purchase = await edgeNativeInvoke('purchaseStoreProduct', {
    productId,
    appAccountToken: session.user.id,
  })

  const outcome = purchaseOutcome(purchase)
  if (!outcome.ok) return outcome

  const { error } = await supabaseClient.functions.invoke('apple-iap-verify', {
    body: {
      action: 'confirm',
      product_slug: productSlug,
      product_id: productId,
      price_interval: purchase?.priceInterval || options.priceInterval || null,
      transaction_id: purchase?.transactionId || null,
      original_transaction_id: purchase?.originalTransactionId || null,
      signed_transaction_info: purchase?.signedTransactionInfo || null,
      expires_at: purchase?.expiresAt || null,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) throw new Error(error.message || 'Could not verify App Store purchase.')

  return { ok: true, via: 'iap' }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} creatorUserId
 * @param {string} fanTierKey
 */
export async function startCreatorFanIapPurchase(supabaseClient, creatorUserId, fanTierKey) {
  if (!isEdgeiOSShell()) {
    throw new Error('In-app purchase is only available in the Edge app.')
  }
  const productId = iapProductIdForFanTier(fanTierKey)
  if (!productId) throw new Error('This fan plan is not available for in-app purchase.')
  const creatorId = String(creatorUserId || '').trim()
  if (!creatorId) throw new Error('Creator is required.')

  const session = await beginAppleIapIntent(supabaseClient, {
    productId,
    kind: 'creator_fan',
    creatorUserId: creatorId,
    fanTierKey,
  })

  const purchase = await edgeNativeInvoke('purchaseStoreProduct', {
    productId,
    appAccountToken: session.user.id,
  })

  const outcome = purchaseOutcome(purchase)
  if (!outcome.ok) return outcome

  const { error } = await supabaseClient.functions.invoke('apple-iap-verify', {
    body: {
      action: 'confirm',
      kind: 'creator_fan',
      creator_user_id: creatorId,
      fan_tier_key: fanTierKey,
      product_id: productId,
      price_interval: purchase?.priceInterval || 'monthly',
      transaction_id: purchase?.transactionId || null,
      original_transaction_id: purchase?.originalTransactionId || null,
      signed_transaction_info: purchase?.signedTransactionInfo || null,
      expires_at: purchase?.expiresAt || null,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) throw new Error(error.message || 'Could not verify App Store purchase.')

  return { ok: true, via: 'iap' }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function restoreEdgeIapPurchases(supabaseClient) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  const session = await restoreSupabaseSession(supabaseClient)
  if (!session?.access_token) {
    const err = new Error('Sign in to restore purchases.')
    err.code = 'CHECKOUT_AUTH_REQUIRED'
    throw err
  }

  const result = await edgeNativeInvoke('restoreStorePurchases')
  const transactions = Array.isArray(result?.transactions) ? result.transactions : []
  let restored = 0
  for (const tx of transactions) {
    if (!tx?.signedTransactionInfo && !tx?.originalTransactionId) continue
    const { error } = await supabaseClient.functions.invoke('apple-iap-verify', {
      body: {
        action: 'confirm',
        restore: true,
        product_slug: tx.productSlug || null,
        product_id: tx.productId || null,
        price_interval: tx.priceInterval || null,
        transaction_id: tx.transactionId || null,
        original_transaction_id: tx.originalTransactionId || null,
        signed_transaction_info: tx.signedTransactionInfo || null,
        expires_at: tx.expiresAt || null,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!error) restored += 1
  }
  return { ok: true, count: restored, via: 'iap' }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 */
export async function openAppleSubscriptionManagement(supabaseClient) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  void supabaseClient
  try {
    const result = await edgeNativeInvoke('manageStoreSubscriptions')
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    await edgeNativeInvoke('openAppSettings')
    return { ok: true, via: 'settings' }
  }
}

/**
 * Present Apple's in-app refund sheet (`Transaction.beginRefundRequest`).
 * @param {{ productId?: string | null, transactionId?: string | null }} [options]
 */
export async function requestAppleIapRefund(options = {}) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  const result = await edgeNativeInvoke('beginRefundRequest', {
    productId: options.productId || null,
    transactionId: options.transactionId || null,
  })
  if (result?.status === 'no_transaction') {
    throw new Error('No App Store purchase found on this Apple ID to refund.')
  }
  if (result?.status === 'cancelled') {
    return { ok: true, cancelled: true, via: 'bridge' }
  }
  if (result?.ok === false) {
    throw new Error('Could not open the App Store refund sheet.')
  }
  return { ok: true, via: 'bridge' }
}
