import Stripe from 'npm:stripe@17.7.0'
import { jsonResponse } from '../_shared/billingCors.ts'
import { requireStripeSecretKey, requireStripeWebhookSecret } from '../_shared/billingEnv.ts'
import {
  createBillingAdmin,
  recordWebhookEvent,
  upsertLifetimePurchaseFromCheckout,
  upsertUserSubscriptionFromStripe,
  type StripeSubscriptionPayload,
} from '../_shared/billingDb.ts'

async function resolveUserAndProduct(
  admin: ReturnType<typeof createBillingAdmin>,
  subscription: StripeSubscriptionPayload,
) {
  let userId = subscription.metadata?.supabase_user_id?.trim() || null
  let productSlug = subscription.metadata?.product_slug?.trim() || null

  if (!userId && subscription.customer) {
    const { data } = await admin
      .from('profiles')
      .select('user_id')
      .eq('stripe_customer_id', String(subscription.customer))
      .maybeSingle()
    userId = data?.user_id ?? null
  }

  if (!productSlug && userId) {
    const { data } = await admin
      .from('user_subscriptions')
      .select('product_slug')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle()
    productSlug = data?.product_slug ?? null
  }

  return { userId, productSlug }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const stripe = new Stripe(requireStripeSecretKey())
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return jsonResponse({ error: 'Missing stripe-signature header.' }, 400)
    }

    const rawBody = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      requireStripeWebhookSecret(),
    )
    const admin = createBillingAdmin()

    const isNew = await recordWebhookEvent(admin, event.id, event.type)
    if (!isNew) {
      return jsonResponse({ ok: true, duplicate: true })
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as StripeSubscriptionPayload
      const { userId, productSlug } = await resolveUserAndProduct(admin, subscription)
      if (!userId) {
        console.warn('stripe-webhook: missing user for subscription', subscription.id)
        return jsonResponse({ ok: true, skipped: true })
      }
      await upsertUserSubscriptionFromStripe(admin, {
        userId,
        productSlug: productSlug || 'slots-edge',
        subscription,
      })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      const userId =
        session.client_reference_id?.trim() ||
        session.metadata?.supabase_user_id?.trim() ||
        null

      if (userId && session.customer) {
        await admin
          .from('profiles')
          .update({ stripe_customer_id: String(session.customer) })
          .eq('user_id', userId)
      }

      if (session.mode === 'payment') {
        const productSlug = session.metadata?.product_slug?.trim() || 'slots-edge-lifetime'
        if (productSlug !== 'slots-edge-lifetime') {
          return jsonResponse({ ok: true, skipped: true })
        }
        if (!userId) {
          console.warn('stripe-webhook: lifetime payment missing user', session.id)
          return jsonResponse({ ok: true, skipped: true })
        }

        const paymentReferenceId =
          (typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id) || session.id

        await upsertLifetimePurchaseFromCheckout(admin, {
          userId,
          productSlug,
          stripeCustomerId: String(session.customer),
          paymentReferenceId,
        })

        return jsonResponse({ ok: true })
      }

      if (session.mode !== 'subscription' || !session.subscription) {
        return jsonResponse({ ok: true })
      }

      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as StripeSubscriptionPayload

      const resolvedUserId =
        userId ||
        subscription.metadata?.supabase_user_id?.trim() ||
        null
      const productSlug =
        session.metadata?.product_slug?.trim() ||
        subscription.metadata?.product_slug?.trim() ||
        'slots-edge'

      if (resolvedUserId) {
        await upsertUserSubscriptionFromStripe(admin, {
          userId: resolvedUserId,
          productSlug,
          subscription,
        })
      }
    }

    return jsonResponse({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('stripe-webhook error', msg)
    return jsonResponse({ error: msg || 'Webhook error' }, 400)
  }
})
