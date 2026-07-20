import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type Stripe from 'npm:stripe@17.7.0'

const PRODUCT_LABEL: Record<string, string> = {
  'slots-edge-starter': 'Slots Edge',
  'slots-edge': 'Slots Edge Pro',
  'slots-edge-lifetime': 'Slots Edge Lifetime',
}

function billingAlertFromAddress(): string {
  return (
    Deno.env.get('BILLING_ADMIN_ALERT_FROM')?.trim() ||
    Deno.env.get('RESEND_FROM')?.trim() ||
    'EdgeTilt <noreply@auth.edgetilt.com>'
  )
}

function parseBillingAlertEmails(): string[] {
  const raw =
    Deno.env.get('BILLING_ADMIN_ALERT_EMAILS')?.trim() ||
    Deno.env.get('BILLING_ADMIN_ALERT_EMAIL')?.trim() ||
    ''
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(/[,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ]
}

function formatMoney(amountCents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) return 'n/a'
  const cur = String(currency || 'usd').toUpperCase()
  const major = amountCents / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(major)
  } catch {
    return `${major.toFixed(2)} ${cur}`
  }
}

function productLabel(slug: string): string {
  return PRODUCT_LABEL[slug] || slug
}

async function loadSubscriberContext(admin: SupabaseClient, userId: string | null) {
  if (!userId) return { handle: null as string | null, email: null as string | null }
  const { data: profile } = await admin
    .from('profiles')
    .select('handle')
    .eq('user_id', userId)
    .maybeSingle()
  let email: string | null = null
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (!error) email = data.user?.email?.trim().toLowerCase() || null
  } catch {
    // non-fatal
  }
  return { handle: profile?.handle?.trim() || null, email }
}

function checkoutCustomerEmail(session: Stripe.Checkout.Session): string | null {
  const fromDetails = session.customer_details?.email?.trim()
  if (fromDetails) return fromDetails.toLowerCase()
  const legacy = session.customer_email?.trim()
  if (legacy) return legacy.toLowerCase()
  return null
}

export type BillingCheckoutAlertKind = 'new_checkout' | 'plan_change' | 'lifetime'

/**
 * Email ops when Checkout completes. Never throws — webhook must still return 200.
 */
export async function sendBillingCheckoutAdminAlert(
  admin: SupabaseClient,
  args: {
    session: Stripe.Checkout.Session
    userId: string | null
    productSlug: string
    kind: BillingCheckoutAlertKind
    stripeSubscriptionId?: string | null
  },
) {
  const recipients = parseBillingAlertEmails()
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!recipients.length) {
    console.log('billingAdminAlert: skipped (BILLING_ADMIN_ALERT_EMAILS not set)')
    return
  }
  if (!resendKey) {
    console.warn('billingAdminAlert: skipped (RESEND_API_KEY not set)')
    return
  }

  try {
    const { session, userId, productSlug, kind, stripeSubscriptionId } = args
    const ctx = await loadSubscriberContext(admin, userId)
    const payerEmail = checkoutCustomerEmail(session) || ctx.email
    const handle = ctx.handle
    const label = productLabel(productSlug)
    const amount = formatMoney(session.amount_total, session.currency)
    const modeLabel =
      kind === 'lifetime'
        ? 'Lifetime purchase'
        : kind === 'plan_change'
          ? 'Plan change (Checkout)'
          : 'New subscription'

    const handlePart = handle ? `@${handle}` : '(no handle)'
    const subject = `[EdgeTilt] ${modeLabel}: ${label} · ${amount} · ${handlePart}`

    const lines = [
      modeLabel,
      '',
      `Product: ${label} (${productSlug})`,
      `Amount: ${amount}`,
      `Stripe mode: ${session.livemode ? 'live' : 'test'}`,
      '',
      `Member: ${handlePart}`,
      payerEmail ? `Email: ${payerEmail}` : 'Email: (unknown)',
      userId ? `User id: ${userId}` : '',
      `Checkout session: ${session.id}`,
      stripeSubscriptionId ? `Subscription: ${stripeSubscriptionId}` : '',
      session.customer ? `Customer: ${session.customer}` : '',
      '',
      'Stripe Dashboard → Payments / Subscriptions for receipt details.',
    ].filter(Boolean)

    const html = lines.map((line) => `<p>${line.replace(/</g, '&lt;')}</p>`).join('')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: billingAlertFromAddress(),
        to: recipients,
        subject,
        text: lines.join('\n'),
        html,
      }),
    })

    const raw = await res.text()
    if (!res.ok) {
      console.warn('billingAdminAlert: Resend failed', res.status, raw.slice(0, 300))
      return
    }
    console.log('billingAdminAlert: sent', { to: recipients, subject, sessionId: session.id })
  } catch (err) {
    console.warn('billingAdminAlert: error', err instanceof Error ? err.message : String(err))
  }
}
