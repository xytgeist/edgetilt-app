import Stripe from 'npm:stripe@17.7.0'

const PLATFORM_RECURRING_SLUGS = new Set(['slots-edge', 'slots-edge-starter'])

/** UTC calendar month bounds for "paid this month" lifetime upgrade credit. */
export function utcCalendarMonthBounds(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { monthStart, monthEnd }
}

function invoicePaidAt(invoice: Stripe.Invoice): Date | null {
  const paidAtSec = invoice.status_transitions?.paid_at
  if (typeof paidAtSec === 'number' && paidAtSec > 0) {
    return new Date(paidAtSec * 1000)
  }
  if (invoice.status === 'paid' && typeof invoice.created === 'number') {
    return new Date(invoice.created * 1000)
  }
  return null
}

function isPlatformRecurringSlug(productSlug: string | null | undefined): boolean {
  return PLATFORM_RECURRING_SLUGS.has(String(productSlug || '').trim())
}

/**
 * Credit the largest platform recurring subscription payment made in the current UTC
 * calendar month (Starter or Pro). Used when upgrading to Lifetime same month.
 */
export async function computeLifetimeUpgradeCreditCents(
  stripe: Stripe,
  customerId: string,
): Promise<number> {
  const customer = customerId.trim()
  if (!customer) return 0

  const { monthStart, monthEnd } = utcCalendarMonthBounds()
  const invoices = await stripe.invoices.list({
    customer,
    status: 'paid',
    limit: 24,
  })

  let maxCredit = 0
  for (const invoice of invoices.data) {
    const paidAt = invoicePaidAt(invoice)
    if (!paidAt || paidAt < monthStart || paidAt >= monthEnd) continue

    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id || null
    if (!subscriptionId) continue

    let subscription: Stripe.Subscription
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId)
    } catch {
      continue
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') continue

    const productSlug = subscription.metadata?.product_slug?.trim() || null
    if (!isPlatformRecurringSlug(productSlug)) continue

    const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0
    if (amountPaid > maxCredit) maxCredit = amountPaid
  }

  return maxCredit
}

/** @param {number} listUnitAmountCents @param {number} percentOff */
export function applyPercentOffCents(listUnitAmountCents: number, percentOff: number): number {
  const n = Number(listUnitAmountCents)
  if (!Number.isFinite(n) || n <= 0) return 0
  const pct = Number(percentOff)
  if (!Number.isFinite(pct) || pct <= 0) return Math.round(n)
  return Math.round(n * (1 - pct / 100))
}

export type LifetimeCheckoutPricing = {
  listUnitAmountCents: number
  promoPercentOff: number
  promoDiscountCents: number
  upgradeCreditCents: number
  checkoutUnitAmountCents: number
}

/**
 * Lifetime checkout uses a computed one-time amount when founding / affiliate / upgrade
 * credit apply (Stripe Checkout allows one discount; we bake multiples into unit_amount).
 */
export async function buildLifetimeCheckoutPricing(
  stripe: Stripe,
  args: {
    lifetimePriceId: string
    promoPercentOff: number
    upgradeCreditCents: number
  },
): Promise<LifetimeCheckoutPricing> {
  const price = await stripe.prices.retrieve(args.lifetimePriceId)
  const listUnitAmountCents =
    typeof price.unit_amount === 'number' && price.unit_amount > 0 ? price.unit_amount : 0
  if (!listUnitAmountCents) {
    throw new Error('Lifetime Stripe price is missing unit_amount.')
  }

  const afterPromoCents = applyPercentOffCents(listUnitAmountCents, args.promoPercentOff)
  const promoDiscountCents = Math.max(0, listUnitAmountCents - afterPromoCents)
  const creditCents = Math.max(0, Math.min(args.upgradeCreditCents, afterPromoCents))
  const checkoutUnitAmountCents = Math.max(50, afterPromoCents - creditCents)

  return {
    listUnitAmountCents,
    promoPercentOff: args.promoPercentOff,
    promoDiscountCents,
    upgradeCreditCents: creditCents,
    checkoutUnitAmountCents,
  }
}

export function lifetimeCheckoutUsesComputedPrice(pricing: LifetimeCheckoutPricing): boolean {
  return (
    pricing.promoDiscountCents > 0 ||
    pricing.upgradeCreditCents > 0 ||
    pricing.checkoutUnitAmountCents !== pricing.listUnitAmountCents
  )
}
