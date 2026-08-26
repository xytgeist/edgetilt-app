/**
 * StoreKit IAP bridge + server verify for EdgeiOS shell.
 * Product ids must match App Store Connect + `EdgeStoreKitManager.swift`.
 */
import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'
import { restoreSupabaseSession } from './supabaseSessionRestore.js'
import {
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_LIFETIME,
  PRODUCT_SLOTS_EDGE_STARTER,
} from '../features/billing/edgeProducts.js'

/** @typedef {'monthly' | 'annual'} IapPriceInterval */

export const EDGE_IAP_PRODUCT_IDS = {
  [`${PRODUCT_SLOTS_EDGE_STARTER}:monthly`]: 'com.edgetilt.app.slots_edge_starter.monthly',
  [`${PRODUCT_SLOTS_EDGE_STARTER}:annual`]: 'com.edgetilt.app.slots_edge_starter.annual',
  [`${PRODUCT_SLOTS_EDGE}:monthly`]: 'com.edgetilt.app.slots_edge.monthly',
  [`${PRODUCT_SLOTS_EDGE}:annual`]: 'com.edgetilt.app.slots_edge.annual',
  [PRODUCT_SLOTS_EDGE_LIFETIME]: 'com.edgetilt.app.slots_edge_lifetime',
}

/**
 * @param {string} productSlug
 * @param {IapPriceInterval} [priceInterval]
 */
export function iapProductIdForPlan(productSlug, priceInterval = 'monthly') {
  if (productSlug === PRODUCT_SLOTS_EDGE_LIFETIME) {
    return EDGE_IAP_PRODUCT_IDS[PRODUCT_SLOTS_EDGE_LIFETIME]
  }
  return EDGE_IAP_PRODUCT_IDS[`${productSlug}:${priceInterval}`] || null
}

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
 * @param {string} productSlug
 * @param {{ priceInterval?: IapPriceInterval }} [options]
 */
export async function startEdgeIapPurchase(supabaseClient, productSlug, options = {}) {
  if (!isEdgeiOSShell()) {
    throw new Error('In-app purchase is only available in the Edge app.')
  }
  const productId = iapProductIdForPlan(productSlug, options.priceInterval || 'monthly')
  if (!productId) throw new Error('This plan is not available for in-app purchase.')

  const session = await restoreSupabaseSession(supabaseClient)
  if (!session?.user?.id) {
    const err = new Error('Sign in to continue to checkout.')
    err.code = 'CHECKOUT_AUTH_REQUIRED'
    throw err
  }

  const purchase = await edgeNativeInvoke('purchaseStoreProduct', {
    productId,
    appAccountToken: session.user.id,
  })

  if (purchase?.status === 'cancelled') {
    return { ok: false, cancelled: true }
  }
  if (purchase?.ok === false && !purchase?.signedTransactionInfo) {
    throw new Error('Purchase did not complete.')
  }

  const { error } = await supabaseClient.functions.invoke('apple-iap-verify', {
    body: {
      product_slug: productSlug,
      product_id: productId,
      price_interval: purchase?.priceInterval || options.priceInterval || null,
      transaction_id: purchase?.transactionId || null,
      original_transaction_id: purchase?.originalTransactionId || null,
      signed_transaction_info: purchase?.signedTransactionInfo || null,
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
  for (const tx of transactions) {
    if (!tx?.signedTransactionInfo && !tx?.originalTransactionId) continue
    await supabaseClient.functions.invoke('apple-iap-verify', {
      body: {
        product_slug: tx.productSlug || null,
        product_id: tx.productId || null,
        price_interval: tx.priceInterval || null,
        transaction_id: tx.transactionId || null,
        original_transaction_id: tx.originalTransactionId || null,
        signed_transaction_info: tx.signedTransactionInfo || null,
        restore: true,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  }
  return { ok: true, count: transactions.length, via: 'iap' }
}
