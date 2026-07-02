/** Maps product slug (+ optional billing interval) to Edge secret Stripe Price id. */
export function stripePriceSecretForProduct(
  productSlug: string,
  priceInterval: 'monthly' | 'annual' = 'monthly',
): string {
  if (productSlug === 'slots-edge' && priceInterval === 'annual') {
    const annual = Deno.env.get('STRIPE_PRICE_SLOTS_EDGE_ANNUAL')?.trim()
    if (!annual) {
      throw new Error('Missing Edge secret STRIPE_PRICE_SLOTS_EDGE_ANNUAL for annual Full Edge billing.')
    }
    return annual
  }

  const envKey = `STRIPE_PRICE_${productSlug.toUpperCase().replace(/-/g, '_')}`
  const priceId = Deno.env.get(envKey)?.trim()
  if (!priceId) {
    throw new Error(`Missing Edge secret ${envKey} for product "${productSlug}".`)
  }
  return priceId
}

/** Optional early-bird coupon (10% × 12 months). Returns null when unset. */
export function stripeEarlyBirdCouponId(): string | null {
  return Deno.env.get('STRIPE_COUPON_EARLY_BIRD')?.trim() || null
}

export function requireStripeSecretKey(): string {
  const key = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY Edge secret.')
  return key
}

export function requireStripeWebhookSecret(): string {
  const key = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim()
  if (!key) throw new Error('Missing STRIPE_WEBHOOK_SECRET Edge secret.')
  return key
}

export function checkoutReturnUrls(req: Request, productSlug: string) {
  const origin =
    req.headers.get('origin')?.trim() ||
    Deno.env.get('STRIPE_CHECKOUT_DEFAULT_ORIGIN')?.trim() ||
    'http://localhost:5173'
  const base = origin.replace(/\/+$/, '')
  return {
    success_url: `${base}/?billing=success&product=${encodeURIComponent(productSlug)}`,
    cancel_url: `${base}/?billing=cancel&product=${encodeURIComponent(productSlug)}`,
  }
}
